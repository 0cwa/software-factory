import { installTestNode, disposeTestNode } from "./helpers/install-test-node.ts";
import assert from "node:assert/strict";
import { createProtocolFabric, type JsonSchemaLite } from "../packages/pi-protocol/index.ts";
import { createProtocolTool, projectProtocolViewModel } from "../packages/pi-protocol/tool/index.ts";

const schema: JsonSchemaLite = { type: "object", properties: {} };
const largeBoundedSchema: JsonSchemaLite = {
  type: "object",
  properties: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [
    `field_${index}`,
    { type: "string", description: "x".repeat(8_000) },
  ])),
};
const fabric = createProtocolFabric({ maxConcurrentInvocations: 2, maxQueuedInvocations: 2 });
for (let index = 0; index < 15; index++) {
  const nodeId = `projection_${String(index).padStart(2, "0")}`;
  installTestNode(fabric, {
    node: {
      nodeId,
      purpose: `Projection pagination fixture ${index}`,
      provides: Array.from({ length: index === 0 ? 20 : 1 }, (_, provideIndex) => ({
        name: `provide_${String(provideIndex).padStart(2, "0")}`,
        description: "Bounded projected capability",
        inputSchema: index === 0 && provideIndex === 19 ? largeBoundedSchema : schema,
        outputSchema: schema,
        execution: { type: "handler" as const, handler: "run" },
      })),
    },
    handlers: { run: () => ({}) },
  });
}
let effect = false;
let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
installTestNode(fabric, {
  node: {
    nodeId: "projection_effect",
    purpose: "Cancellation truth fixture",
    provides: [{
      name: "commit",
      description: "Perform a non-cooperative effect",
      inputSchema: schema,
      outputSchema: schema,
      execution: { type: "handler", handler: "commit" },
    }],
  },
  handlers: { commit: async () => { effect = true; await gate; return {}; } },
});

const tool = createProtocolTool(fabric);
const parameterText = JSON.stringify(tool.parameters);
assert(!parameterText.includes("request"));
assert(!parameterText.includes("action"));
assert(!parameterText.includes("traceId"));
assert(!parameterText.includes("callerNodeId"));
assert(!parameterText.includes("describe_node"));
assert(!parameterText.includes("describe_provide"));
assert(!parameterText.includes('"nodeId"'));
assert(!parameterText.includes('"provide"'));
assert.throws(() => tool.prepareArguments?.({
  action: "invoke",
  request: { nodeId: "projection_01", provide: "provide_00", input: {} },
}), /unsupported fields/);

const first = await tool.execute("page-one", { op: "list" });
const firstDetails = first.details as { schemaVersion: 1; nodes: unknown[]; nextCursor?: string };
assert.equal(firstDetails.schemaVersion, 1);
assert.equal(firstDetails.nodes.length, 12);
assert.match(firstDetails.nextCursor ?? "", /^p:/);
const second = await tool.execute("page-two", { op: "list", cursor: firstDetails.nextCursor });
assert.equal((second.details as { nodes: unknown[] }).nodes.length, 4);

const node = await tool.execute("node-page", { op: "describe", target: "projection_00", limit: 5 });
const nodeDetails = node.details as { node: { provides: unknown[]; nextCursor?: string } };
assert.equal(nodeDetails.node.provides.length, 5);
assert.match(nodeDetails.node.nextCursor ?? "", /^p:/);
const nextNode = await tool.execute("node-page-two", { op: "describe", target: "projection_00", limit: 5, cursor: nodeDetails.node.nextCursor });
assert.equal((nextNode.details as { node: { provides: unknown[] } }).node.provides.length, 5);
const largeSchema = await tool.execute("large-schema", { op: "describe", target: "projection_00.provide_19" });
assert.equal((largeSchema.details as { provide: { schemaTruncated: boolean } }).provide.schemaTruncated, true);
assert((largeSchema.content[0]?.text.length ?? 0) < 70_000, "exact contract projection must have a hard output bound");

const conflict = await tool.execute("bad-command", { op: "list", action: "invoke" } as never);
assert.deepEqual((conflict.details as { error: unknown }).error, { code: "INVALID_REQUEST", message: "Protocol tool request is invalid" });
const badCursor = await tool.execute("bad-cursor", { op: "list", cursor: "../../secret" });
assert.equal((badCursor.details as { error: { code: string } }).error.code, "INVALID_REQUEST");

const identity = await tool.execute("identity", {
  target: "projection_01.provide_00",
  input: {},
});
const identityDetails = identity.details as {
  schemaVersion: 1;
  op: "call";
  receipt: { schemaVersion: 1; invocationId: string };
  trace: { events: Array<{ traceId: string; spanId: string }> };
};
assert.equal(identityDetails.schemaVersion, 1);
assert.equal(identityDetails.op, "call");
assert.equal(identityDetails.receipt.schemaVersion, 1);
assert.deepEqual(identity.details, JSON.parse(JSON.stringify(identity.details)), "persisted details must be strict JSON");
assert(!JSON.stringify(identity.details).includes('"action"'));
assert(!JSON.stringify(identity.details).includes("executor.output_delta"), "streamed deltas must not persist in final details");
const projected = projectProtocolViewModel(identity, { target: "projection_01.provide_00", input: {} }, { expanded: true });
assert(Object.isFrozen(projected));
assert(Object.isFrozen(projected.trace));
assert(identityDetails.trace.events.every((event) => /^trace_/.test(event.traceId)));
assert(identityDetails.trace.events.every((event) => /^span_/.test(event.spanId)));

let updates = 0;
const withFailingObserver = await tool.execute("observer", { target: "projection_01.provide_00", input: {} }, undefined, () => {
  updates += 1;
  throw new Error("observer failed");
});
assert.equal((withFailingObserver.details as { state: string }).state, "completed");
assert.equal(updates, 0, "plain handlers emit no synthetic execution updates");

const controller = new AbortController();
const pending = tool.execute("effect", { target: "projection_effect.commit", input: {} }, controller.signal);
while (!effect) await new Promise((resolve) => setTimeout(resolve, 1));
controller.abort();
const unknown = await pending;
const unknownDetails = unknown.details as {
  state: string;
  result: { ok: false; error: { code: string } };
  receipt: { state: string; effectsMayHaveOccurred: boolean };
};
assert.equal(unknownDetails.state, "outcome_unknown");
assert.equal(unknownDetails.result.error.code, "OUTCOME_UNKNOWN");
assert.equal(unknownDetails.receipt.state, "outcome_unknown");
assert.equal(unknownDetails.receipt.effectsMayHaveOccurred, true);
assert.match(unknown.content[0]?.text ?? "", /^OUTCOME_UNKNOWN:/);
release();

console.log("canonical thin Pi projection is bounded, host-authoritative, and cancellation-truthful");
