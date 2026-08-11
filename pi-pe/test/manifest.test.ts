import assert from "node:assert/strict";
import test from "node:test";
import { createProtocolFabric } from "@kybernetria/pi-protocol/core";
import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";
import { createGeneratedManifest } from "../src/generated/manifest.ts";
import { createManagementHandlers } from "../src/protocol/handlers.ts";
import { loadManagementProtocol } from "../src/protocol/manifest.ts";
import { PipelineService } from "../src/pipeline/service.ts";
import { PipelineRepository } from "../src/storage/repository.ts";
import { fixture } from "./helpers.ts";

const EXPECTED = [
  "catalog", "describe_target", "validate_pipeline", "save_pipeline", "get_pipeline", "list_pipelines",
  "delete_pipeline", "run_pipeline", "dry_run_mapping", "reload_pipelines",
];

test("static manifest is canonical and every provide has an exact handler", () => {
  const definition = loadManagementProtocol();
  assert.deepEqual(definition.manifest.provides.map((provide) => provide.name), EXPECTED);
  const fabric = createProtocolFabric();
  const service = new PipelineService(fabric, new PipelineRepository("/tmp/pi-pe-manifest-test-unused"));
  const handlers = createManagementHandlers(fabric, service, definition.manifest.node.id);
  assert.deepEqual(Object.keys(handlers), EXPECTED);
  assert.doesNotThrow(() => fabric.install(definition, { handlers }));
});

test("generated manifest exposes an admitted business contract without deployment metadata", async () => {
  const spec = await fixture("mapped.pipeline.json");
  spec.dependencies = [{
    target: "fixture.wrap", nodeId: "fixture", provide: "wrap",
    execution: { type: "handler", handler: "wrap" }, effects: ["file_write"],
    inputSchema: { type: "object" }, outputSchema: { type: "object" }, fingerprint: "test",
  }];
  const manifest = createGeneratedManifest(spec);
  const definition = parseProtocolManifest(manifest);
  assert.equal(manifest.node.id, "pi_pe_pipeline_mapped");
  assert.equal(manifest.provides.length, 1);
  assert.equal(manifest.provides[0].name, "run");
  assert.equal(manifest.provides[0].inputSchema.type, spec.inputSchema.type);
  assert.equal(manifest.provides[0].outputSchema.type, spec.outputSchema.type);
  assert.equal("execution" in manifest.provides[0], false);
  assert.deepEqual(manifest.provides[0].effects, ["fs.write", "protocol.invoke"]);
});
