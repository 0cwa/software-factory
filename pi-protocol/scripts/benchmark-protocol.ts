import { invokeResult } from "./helpers/invoke-test.ts";
import { installTestNode, disposeTestNode } from "./helpers/install-test-node.ts";
import { performance } from "node:perf_hooks";
import { createProtocolFabric, type JsonSchemaLite } from "../packages/pi-protocol/index.ts";

const fabric = createProtocolFabric({ maxConcurrentInvocations: 64, maxQueuedInvocations: 64 });
const schema: JsonSchemaLite = { type: "object", required: ["value"], properties: { value: { type: "string", description: "Searchable benchmark value" } } };
for (let node = 0; node < 4; node++) {
  const provides = Array.from({ length: 128 }, (_, index) => ({
    name: `capability_${index}`,
    description: `Benchmark capability ${index} notification search`,
    tags: ["benchmark", index % 2 ? "odd" : "even"],
    effects: ["read-only"],
    inputSchema: schema,
    outputSchema: schema,
    execution: { type: "handler" as const, handler: "run" },
  }));
  installTestNode(fabric, { node: { nodeId: `benchmark_${node}`, purpose: "Protocol performance benchmark", provides }, handlers: { run: (input) => input } });
}
const searchStarted = performance.now();
for (let index = 0; index < 1_000; index++) fabric.search("notification searchable", { limit: 8, tags: ["benchmark"] });
const searchMs = performance.now() - searchStarted;
const invokeStarted = performance.now();
for (let index = 0; index < 1_000; index++) {
  const result = await invokeResult(fabric, { nodeId: "benchmark_0", provide: "capability_0", input: { value: "ok" } });
  if (!result.ok) throw new Error(result.error.message);
}
const invokeMs = performance.now() - invokeStarted;
const report = { schemaVersion: 1, provides: 512, searches: 1_000, invocations: 1_000, searchMs: Math.round(searchMs), invokeMs: Math.round(invokeMs) };
console.log(JSON.stringify(report));
if (searchMs > 5_000) throw new Error(`Protocol search benchmark exceeded 5000ms: ${searchMs}`);
if (invokeMs > 5_000) throw new Error(`Protocol invocation benchmark exceeded 5000ms: ${invokeMs}`);
