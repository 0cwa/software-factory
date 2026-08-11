import assert from "node:assert/strict";
import {
  createProtocolFabric,
  ensureProtocolFabric,
  getProtocolHostDiagnostics,
  type CanonicalProvenanceEventV1,
  type ExecutionEventV1,
} from "../packages/pi-protocol/index.ts";
import { installTestNode } from "./helpers/install-test-node.ts";
import { invokeResult } from "./helpers/invoke-test.ts";

const fabric = createProtocolFabric();
const auditEvents: CanonicalProvenanceEventV1[] = [];
const executionEvents: ExecutionEventV1[] = [];
fabric.subscribeAudit((event) => { auditEvents.push(event); });
fabric.subscribeExecution((event) => { executionEvents.push(event); });

const inputSchema = {
  type: "object" as const,
  required: ["text"],
  properties: { text: { type: "string" as const } },
  additionalProperties: false,
};
const outputSchema = {
  type: "object" as const,
  required: ["text"],
  properties: { text: { type: "string" as const } },
  additionalProperties: false,
};
const registration = installTestNode(fabric, {
  node: {
    nodeId: "minimal",
    purpose: "Canonical minimal fabric fixture",
    provides: [
      {
        name: "echo",
        description: "Echo input",
        inputSchema,
        outputSchema,
        execution: { type: "handler", handler: "echo" },
        effects: ["fs.read"],
      },
      {
        name: "stream",
        description: "Emit canonical execution telemetry",
        inputSchema,
        outputSchema,
        execution: { type: "handler", handler: "stream" },
      },
      {
        name: "bad_output",
        description: "Return invalid output",
        inputSchema,
        outputSchema,
        execution: { type: "handler", handler: "bad_output" },
      },
      {
        name: "fail",
        description: "Throw safely",
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema,
        execution: { type: "handler", handler: "fail" },
      },
    ],
  },
  handlers: {
    echo: (input) => input,
    stream: async (input, context) => {
      await context?.emitExecutionEvent?.({
        schemaVersion: 1,
        type: "executor.output_delta",
        traceId: context.traceId!,
        spanId: context.spanId!,
        textDelta: (input as { text: string }).text,
      });
      return input;
    },
    bad_output: () => ({}),
    fail: () => { throw new Error("fixture failure"); },
  },
});

assert.equal(registration.nodeId, "minimal");
assert.match(registration.contractDigest, /^sha256:/);
const registry = fabric.registry();
assert.ok(Object.isFrozen(registry));
assert.ok(Object.isFrozen(registry.nodes));
assert.equal(registry.provides.length, 4);
assert.equal(fabric.search("echo").provides[0]?.globalId, "minimal.echo");
assert.equal(fabric.describeProvide("minimal", "echo")?.inputSchema.required?.[0], "text");

const tracked = await fabric.invokeTracked({ nodeId: "minimal", provide: "echo", input: { text: "hello" } });
assert.deepEqual(tracked.result, { ok: true, nodeId: "minimal", provide: "echo", output: { text: "hello" } });
assert.match(tracked.receipt.invocationId, /^invocation_/);
assert.equal(tracked.receipt.state, "succeeded");
assert.equal((await invokeResult(fabric, { nodeId: "minimal", provide: "echo", input: { text: 42 } })).ok, false);
const invalidOutput = await invokeResult(fabric, { nodeId: "minimal", provide: "bad_output", input: { text: "x" } });
assert.equal(invalidOutput.ok, false);
assert.equal(!invalidOutput.ok && invalidOutput.error.code, "OUTPUT_INVALID");
const failed = await invokeResult(fabric, { nodeId: "minimal", provide: "fail", input: {} });
assert.equal(!failed.ok && failed.error.code, "EXECUTION_FAILED");

const streamed = await invokeResult(fabric, { nodeId: "minimal", provide: "stream", input: { text: "delta" } });
assert.equal(streamed.ok, true);
assert.equal(executionEvents.at(-1)?.type, "executor.output_delta");
assert.equal(executionEvents.at(-1)?.schemaVersion, 1);
await Promise.resolve();
const invocationAudit = auditEvents.filter((event) => "invocationId" in event);
assert.ok(invocationAudit.some((event) => event.type === "invocation.started"));
assert.ok(invocationAudit.some((event) => event.type === "invocation.succeeded"));
assert.ok(invocationAudit.every((event) => !("inputPreview" in event) && !("outputPreview" in event)));

const globalA = ensureProtocolFabric();
const globalB = ensureProtocolFabric();
assert.equal(globalA, globalB);
const diagnostics = getProtocolHostDiagnostics();
assert.equal(diagnostics?.abiVersion, 2);
assert.ok((diagnostics?.runtimeCopies.length ?? 0) >= 1);
assert.equal((globalThis as any)[Symbol.for("pi-protocol.minimal.fabric")], undefined, "v4 must not publish the old fabric anchor");

await registration.dispose();
assert.equal(fabric.describeNode("minimal"), undefined);
console.log("canonical minimal fabric admission, discovery, receipts, telemetry, ABI, and disposal work");
