import { invokeResult } from "./helpers/invoke-test.ts";
import { installTestNode, disposeTestNode } from "./helpers/install-test-node.ts";
import assert from "node:assert/strict";
import {
  ensureProtocolFabric,
  type JsonSchemaLite,
  type ExecutionEventV1,
} from "../packages/pi-protocol/index.ts";
import {
  createPiSdkAgentExecutor,
  type PiSdkAgentSessionEventLike,
  type PiSdkAgentSessionLike,
} from "../packages/pi-protocol/sdk/index.ts";

const textInput: JsonSchemaLite = {
  type: "object",
  required: ["goal"],
  properties: { goal: { type: "string" } },
};

const textOutput: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
};

function createFakeSession() {
  let listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
  const prompts: string[] = [];
  let disposed = false;

  const session: PiSdkAgentSessionLike = {
    async prompt(text) {
      prompts.push(text);
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "planned: " },
      });
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: text },
      });
    },
    subscribe(nextListener) {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    },
    dispose() {
      disposed = true;
    },
  };

  return {
    session,
    prompts,
    get disposed() {
      return disposed;
    },
  };
}

const fake = createFakeSession();
const fabric = ensureProtocolFabric();
const executionEvents: ExecutionEventV1[] = [];
fabric.subscribeExecution((event) => { executionEvents.push(event); });

installTestNode(fabric, {
  node: {
    nodeId: "sdk_adapter_test",
    purpose: "Verify fabric invocation through the Pi SDK adapter seam.",
    provides: [
      {
        name: "plan",
        description: "Create a plan through an SDK-style agent session.",
        inputSchema: textInput,
        outputSchema: textOutput,
        execution: { type: "agent", agent: "planner" },
      },
    ],
  },
  agentExecutors: {
    planner: createPiSdkAgentExecutor({
      createSession: () => fake.session,
      toPrompt: (input) => `Plan ${JSON.stringify(input)}`,
      toOutput: (text) => ({ text }),
    }),
  },
});

assert.equal(fabric.describeProvide("sdk_adapter_test", "plan")?.execution.type, "agent");

executionEvents.length = 0;
const result = await invokeResult(fabric, {
  nodeId: "sdk_adapter_test",
  provide: "plan",
  input: { goal: "ship protocol" },
  traceId: "trace-sdk-runtime-test",
  spanId: "span-sdk-runtime-test",
});

assert.deepEqual(result, {
  ok: true,
  nodeId: "sdk_adapter_test",
  provide: "plan",
  output: { text: 'planned: Plan {"goal":"ship protocol"}' },
});
assert.deepEqual(fake.prompts, ['Plan {"goal":"ship protocol"}']);
assert.equal(fake.disposed, true);
assert.deepEqual(executionEvents, [
  {
    schemaVersion: 1,
    type: "executor.output_delta",
    traceId: "trace-sdk-runtime-test",
    spanId: "span-sdk-runtime-test",
    textDelta: "planned: ",
  },
  {
    schemaVersion: 1,
    type: "executor.output_delta",
    traceId: "trace-sdk-runtime-test",
    spanId: "span-sdk-runtime-test",
    textDelta: 'Plan {"goal":"ship protocol"}',
  },
]);

const statefulFakes: ReturnType<typeof createFakeSession>[] = [];
installTestNode(fabric, {
  node: {
    nodeId: "sdk_stateful_adapter_test",
    purpose: "Verify fabric session metadata reaches the Pi SDK adapter seam.",
    provides: [
      {
        name: "chat",
        description: "Continue a stateful SDK-style agent session.",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "agent", agent: "chat" },
      },
    ],
  },
  agentExecutors: {
    chat: createPiSdkAgentExecutor({
      createSession: () => {
        const fake = createFakeSession();
        statefulFakes.push(fake);
        return fake.session;
      },
    }),
  },
});

const firstStatefulResult = await invokeResult(fabric, {
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  input: "first",
  callerNodeId: "agent_a",
  session: { id: "thread_1", mode: "continue" },
});
const secondStatefulResult = await invokeResult(fabric, {
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  input: "second",
  callerNodeId: "agent_a",
  session: { id: "thread_1", mode: "continue" },
});
assert.deepEqual(firstStatefulResult, {
  ok: true,
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  output: "planned: first",
});
assert.deepEqual(secondStatefulResult, {
  ok: true,
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  output: "planned: second",
});
assert.equal(statefulFakes.length, 1);
assert.deepEqual(statefulFakes[0].prompts, ["first", "second"]);
assert.equal(statefulFakes[0].disposed, false);

const endStatefulResult = await invokeResult(fabric, {
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  input: "done",
  callerNodeId: "agent_a",
  session: { id: "thread_1", mode: "end" },
});
assert.deepEqual(endStatefulResult, {
  ok: true,
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  output: "planned: done",
});
assert.equal(statefulFakes.length, 1);
assert.deepEqual(statefulFakes[0].prompts, ["first", "second", "done"]);
assert.equal(statefulFakes[0].disposed, true);

const afterEndResult = await invokeResult(fabric, {
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  input: "new thread",
  callerNodeId: "agent_a",
  session: { id: "thread_1", mode: "continue" },
});
assert.deepEqual(afterEndResult, {
  ok: true,
  nodeId: "sdk_stateful_adapter_test",
  provide: "chat",
  output: "planned: new thread",
});
assert.equal(statefulFakes.length, 2);
assert.deepEqual(statefulFakes[1].prompts, ["new thread"]);
assert.equal(statefulFakes[1].disposed, false);

console.log("minimal fabric invokes pi sdk adapter executor");
