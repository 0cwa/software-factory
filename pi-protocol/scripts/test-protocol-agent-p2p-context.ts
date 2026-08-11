import { invokeResult } from "./helpers/invoke-test.ts";
import { installTestNode, disposeTestNode } from "./helpers/install-test-node.ts";
import assert from "node:assert/strict";
import {
  createProtocolFabric,
  type CanonicalProvenanceEventV1,
  type ExecutionEventV1,
} from "../packages/pi-protocol/index.ts";
import {
  createPiSdkAgentExecutor,
  type PiSdkAgentSessionEventLike,
  type PiSdkAgentSessionLike,
} from "../packages/pi-protocol/sdk/index.ts";
import { handleProtocolToolInput } from "../packages/pi-protocol/tool/index.ts";

function createFakeSession(onPrompt: (text: string, emit: (delta: string) => void) => Promise<void> | void) {
  let listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
  const prompts: string[] = [];
  let disposed = false;

  const emit = (delta: string) => {
    listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } });
  };

  const session: PiSdkAgentSessionLike = {
    async prompt(text) {
      prompts.push(text);
      await onPrompt(text, emit);
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

const fabric = createProtocolFabric();
const auditEvents: CanonicalProvenanceEventV1[] = [];
const executionEvents: ExecutionEventV1[] = [];
const aSessions: ReturnType<typeof createFakeSession>[] = [];
const bSessions: ReturnType<typeof createFakeSession>[] = [];

fabric.subscribeAudit((event) => { auditEvents.push(event); });
fabric.subscribeExecution((event) => { executionEvents.push(event); });

installTestNode(fabric, {
  node: {
    nodeId: "p2p_b",
    purpose: "Fake child SDK agent.",
    provides: [
      {
        name: "chat",
        description: "Emit child deltas.",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "agent", agent: "child" },
      },
    ],
  },
  agentExecutors: {
    child: createPiSdkAgentExecutor({
      createSession: () => {
        const fake = createFakeSession((text, emit) => {
          emit(`B:${bSessions.length}:`);
          emit(text);
        });
        bSessions.push(fake);
        return fake.session;
      },
    }),
  },
});

installTestNode(fabric, {
  node: {
    nodeId: "p2p_a",
    purpose: "Fake outer SDK agent that autonomously uses the protocol tool.",
    provides: [
      {
        name: "chat",
        description: "Call another protocol provide from inside an SDK agent session.",
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "agent", agent: "outer" },
      },
    ],
  },
  agentExecutors: {
    outer: createPiSdkAgentExecutor({
      createSession: () => {
        const fake = createFakeSession(async (text, emit) => {
          emit("A:start:");
          await handleProtocolToolInput(fabric, { op: "call", target: "p2p_b.chat", input: `child(${text})` });
          emit("A:end");
        });
        aSessions.push(fake);
        return fake.session;
      },
    }),
  },
});

const first = await invokeResult(fabric, {
  nodeId: "p2p_a",
  provide: "chat",
  input: "one",
  traceId: "trace-p2p",
  spanId: "root",
  callerNodeId: "caller",
  session: { id: "thread", mode: "continue" },
});
assert.equal(first.ok, true);

await Promise.resolve();
const started = auditEvents.filter((event): event is Extract<CanonicalProvenanceEventV1, { invocationId: string }> => "invocationId" in event && event.type === "invocation.started");
const outerStarted = started.find((event) => event.target === "p2p_a.chat");
const childStarted = started.find((event) => event.target === "p2p_b.chat");
assert.ok(outerStarted);
assert.ok(childStarted);
assert.equal(childStarted.parentInvocationId, outerStarted.invocationId);
assert.notEqual(childStarted.traceId, "trace-p2p", "canonical audit correlation is host-minted");

const deltas = executionEvents.filter((event): event is Extract<ExecutionEventV1, { type: "executor.output_delta" }> => event.type === "executor.output_delta");
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && event.spanId === "root" && event.textDelta === "A:start:"));
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && /^root\.p2p_a_chat_1$/.test(event.spanId) && event.textDelta === "B:1:"));
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && /^root\.p2p_a_chat_1$/.test(event.spanId) && event.textDelta === "child(one)"));
assert.ok(deltas.some((event) => event.traceId === "trace-p2p" && event.spanId === "root" && event.textDelta === "A:end"));

await invokeResult(fabric, {
  nodeId: "p2p_a",
  provide: "chat",
  input: "two",
  traceId: "trace-p2p-2",
  spanId: "root2",
  callerNodeId: "caller",
  session: { id: "thread", mode: "continue" },
});
assert.equal(aSessions.length, 1);
assert.equal(bSessions.length, 1);
assert.deepEqual(aSessions[0].prompts, ["one", "two"]);
assert.deepEqual(bSessions[0].prompts, ["child(one)", "child(two)"]);
assert.equal(aSessions[0].disposed, false);
assert.equal(bSessions[0].disposed, false);

await invokeResult(fabric, {
  nodeId: "p2p_a",
  provide: "chat",
  input: "done",
  traceId: "trace-p2p-end",
  spanId: "root-end",
  callerNodeId: "caller",
  session: { id: "thread", mode: "end" },
});
assert.equal(aSessions.length, 1);
assert.equal(bSessions.length, 1);
assert.equal(aSessions[0].disposed, true);
assert.equal(bSessions[0].disposed, true);

await invokeResult(fabric, {
  nodeId: "p2p_a",
  provide: "chat",
  input: "ephemeral",
  traceId: "trace-p2p-eph",
  spanId: "root-eph",
  callerNodeId: "caller",
  session: { id: "thread", mode: "ephemeral" },
});
assert.equal(aSessions.length, 2);
assert.equal(bSessions.length, 2);
assert.equal(aSessions[1].disposed, true);
assert.equal(bSessions[1].disposed, true);

console.log("protocol agent p2p context bridge preserves nested traces and sessions");
