import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { ExecutionEventV1 } from "../packages/pi-protocol/index.ts";
import {
  createPiSdkAgentExecutor,
  type PiSdkAgentSessionEventLike,
  type PiSdkAgentSessionLike,
} from "../packages/pi-protocol/sdk/index.ts";
import {
  appendUniquePromptChunks,
  UNIVERSAL_PROTOCOL_AWARENESS_PROMPT,
} from "../packages/pi-protocol/sdk/agent-session.ts";

const protocolAwarenessMarkdown = await readFile(
  new URL("../packages/pi-protocol/prompts/protocol-awareness.md", import.meta.url),
  "utf8",
);
assert.equal(UNIVERSAL_PROTOCOL_AWARENESS_PROMPT, protocolAwarenessMarkdown.trim());

function createFakeSession(options: { throwOnPrompt?: boolean } = {}) {
  let listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
  const prompts: string[] = [];
  let unsubscribed = false;
  let disposed = false;

  const session: PiSdkAgentSessionLike = {
    async prompt(text) {
      prompts.push(text);
      if (options.throwOnPrompt) {
        throw new Error("prompt failed");
      }
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "hello" },
      });
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: " world" },
      });
    },
    subscribe(nextListener) {
      listener = nextListener;
      return () => {
        unsubscribed = true;
      };
    },
    dispose() {
      disposed = true;
    },
  };

  return {
    session,
    prompts,
    get unsubscribed() {
      return unsubscribed;
    },
    get disposed() {
      return disposed;
    },
  };
}

const composedPromptChunks = appendUniquePromptChunks(["base prompt"], [
  UNIVERSAL_PROTOCOL_AWARENESS_PROMPT,
  "## Protocol agent instructions\nReview tasks concisely.",
]);
assert.equal(composedPromptChunks.length, 3);
assert.equal(composedPromptChunks[1], UNIVERSAL_PROTOCOL_AWARENESS_PROMPT);
assert.match(composedPromptChunks[1], /## Pi Protocol/);
assert.match(composedPromptChunks[1], /receipts, failures, grants, and unknown outcomes/);
assert.equal(composedPromptChunks[2], "## Protocol agent instructions\nReview tasks concisely.");
assert.deepEqual(
  appendUniquePromptChunks(composedPromptChunks, [UNIVERSAL_PROTOCOL_AWARENESS_PROMPT]),
  composedPromptChunks,
);

const fake = createFakeSession();
const executor = createPiSdkAgentExecutor({
  createSession: () => fake.session,
  toPrompt: (input) => `Summarize: ${JSON.stringify(input)}`,
  toOutput: (text) => ({ text }),
});

const result = await executor({ topic: "protocol" });
assert.deepEqual(result, { text: "hello world" });
assert.deepEqual(fake.prompts, ['Summarize: {"topic":"protocol"}']);
assert.equal(fake.unsubscribed, true);
assert.equal(fake.disposed, true);

const runtimeFake = createFakeSession();
const executionEvents: ExecutionEventV1[] = [];
const runtimeExecutor = createPiSdkAgentExecutor({
  createSession: () => runtimeFake.session,
});
const runtimeResult = await runtimeExecutor("emit runtime please", {
  nodeId: "agent_b",
  provide: "chat",
  traceId: "trace-direct-runtime-test",
  spanId: "span-direct-runtime-test",
  emitExecutionEvent: async (event) => {
    executionEvents.push(event);
    throw new Error("direct runtime recorder failure should be ignored");
  },
});
assert.equal(runtimeResult, "hello world");
assert.deepEqual(executionEvents, [
  {
    schemaVersion: 1,
    type: "executor.output_delta",
    traceId: "trace-direct-runtime-test",
    spanId: "span-direct-runtime-test",
    textDelta: "hello",
  },
  {
    schemaVersion: 1,
    type: "executor.output_delta",
    traceId: "trace-direct-runtime-test",
    spanId: "span-direct-runtime-test",
    textDelta: " world",
  },
]);
assert.equal(runtimeFake.unsubscribed, true);
assert.equal(runtimeFake.disposed, true);

const failingFake = createFakeSession({ throwOnPrompt: true });
const failingExecutor = createPiSdkAgentExecutor({
  createSession: () => failingFake.session,
});

await assert.rejects(async () => failingExecutor("fail please"), /prompt failed/);
assert.deepEqual(failingFake.prompts, ["fail please"]);
assert.equal(failingFake.unsubscribed, true);
assert.equal(failingFake.disposed, true);

const statefulFakes: ReturnType<typeof createFakeSession>[] = [];
const statefulExecutor = createPiSdkAgentExecutor({
  createSession: () => {
    const fake = createFakeSession();
    statefulFakes.push(fake);
    return fake.session;
  },
});

await statefulExecutor("first", {
  nodeId: "agent_b",
  provide: "chat",
  callerNodeId: "agent_a",
  principal: { id: "agent_a", kind: "agent" },
  contractDigest: "sha256:test",
  session: { id: "thread_1", mode: "continue" },
});
await statefulExecutor("second", {
  nodeId: "agent_b",
  provide: "chat",
  callerNodeId: "agent_a",
  principal: { id: "agent_a", kind: "agent" },
  contractDigest: "sha256:test",
  session: { id: "thread_1", mode: "continue" },
});
assert.equal(statefulFakes.length, 1);
assert.deepEqual(statefulFakes[0].prompts, ["first", "second"]);
assert.equal(statefulFakes[0].disposed, false);

await statefulExecutor("done", {
  nodeId: "agent_b",
  provide: "chat",
  callerNodeId: "agent_a",
  principal: { id: "agent_a", kind: "agent" },
  contractDigest: "sha256:test",
  session: { id: "thread_1", mode: "end" },
});
assert.equal(statefulFakes.length, 1);
assert.deepEqual(statefulFakes[0].prompts, ["first", "second", "done"]);
assert.equal(statefulFakes[0].disposed, true);

await statefulExecutor("new thread", {
  nodeId: "agent_b",
  provide: "chat",
  callerNodeId: "agent_a",
  principal: { id: "agent_a", kind: "agent" },
  contractDigest: "sha256:test",
  session: { id: "thread_1", mode: "continue" },
});
assert.equal(statefulFakes.length, 2);
assert.deepEqual(statefulFakes[1].prompts, ["new thread"]);

await assert.rejects(
  async () =>
    statefulExecutor("missing id", {
      nodeId: "agent_b",
      provide: "chat",
      callerNodeId: "agent_a",
      session: { mode: "continue" },
    }),
  /session\.id is required/,
);

let abortListener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
let abortDisposed = false;
const abortingExecutor = createPiSdkAgentExecutor({
  createSession: () => ({
    async prompt() {
      await new Promise(() => undefined);
    },
    subscribe(listener) {
      abortListener = listener;
      return () => {
        abortListener = undefined;
      };
    },
    dispose() {
      abortDisposed = true;
    },
  }),
});
const controller = new AbortController();
const abortPromise = abortingExecutor("hang", { nodeId: "agent_b", provide: "chat", abortSignal: controller.signal });
controller.abort();
await assert.rejects(async () => abortPromise, /Invocation aborted/);
assert.equal(abortListener, undefined);
assert.equal(abortDisposed, true);

console.log("pi sdk agent adapter works");
