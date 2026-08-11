async function invokeResult(fabric: { invokeTracked(request: any): Promise<any> }, request: any): Promise<any> {
  return (await fabric.invokeTracked(request)).result;
}

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProtocolFabric } from "@kybernetria/pi-protocol";
import { PipelineService } from "../src/pipeline/service.ts";
import { registerManagementNode } from "../src/protocol/registration.ts";
import { PipelineRepository } from "../src/storage/repository.ts";
import { fixture, registerMappedFixtures } from "./helpers.ts";

test("complete lifecycle works through management protocol provides", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-integration-"));
  const fabric = createProtocolFabric();
  registerMappedFixtures(fabric);
  const service = new PipelineService(fabric, new PipelineRepository(root));
  registerManagementNode(fabric, service);
  await service.initialize();

  const catalog = await invokeResult(fabric, { nodeId: "pi_pe", provide: "catalog", input: { query: "fixture", generated: false } });
  assert.equal(catalog.ok, true);
  if (catalog.ok) assert((catalog.output as { total: number }).total >= 2);

  const described = await invokeResult(fabric, { nodeId: "pi_pe", provide: "describe_target", input: { target: "fixture.upper" } });
  assert.equal(described.ok, true, described.ok ? "" : `${described.error.code}: ${described.error.message}`);
  if (described.ok) assert.equal(typeof (described.output as { fingerprint: string }).fingerprint, "string");

  const spec = await fixture("mapped.pipeline.json");
  const validation = await invokeResult(fabric, { nodeId: "pi_pe", provide: "validate_pipeline", input: { spec } });
  assert.equal(validation.ok, true);
  if (validation.ok) assert.equal((validation.output as { assurance: string }).assurance, "static");

  const saved = await invokeResult(fabric, { nodeId: "pi_pe", provide: "save_pipeline", input: { spec } });
  assert.equal(saved.ok, true, saved.ok ? "" : saved.error.message);
  assert(fabric.describeProvide("pi_pe_pipeline_mapped", "run"));

  const direct = await invokeResult(fabric, { nodeId: "pi_pe_pipeline_mapped", provide: "run", input: { text: "direct" } });
  assert.equal(direct.ok, true);
  if (direct.ok) assert.deepEqual(direct.output, { result: "Result: DIRECT" });

  const managed = await invokeResult(fabric, { nodeId: "pi_pe", provide: "run_pipeline", input: { id: "mapped", input: { text: "managed" } } });
  assert.equal(managed.ok, true);
  if (managed.ok) {
    assert.equal((managed.output as { status: string }).status, "succeeded");
    assert.deepEqual((managed.output as { output: unknown }).output, { result: "Result: MANAGED" });
  }

  const dry = await invokeResult(fabric, {
    nodeId: "pi_pe",
    provide: "dry_run_mapping",
    input: { id: "mapped", pipelineInput: { text: "dry" }, stepOutputs: { upper: { value: "DRY" }, wrap: { result: "Result: DRY" } } },
  });
  assert.equal(dry.ok, true);
  if (dry.ok) assert.equal((dry.output as { steps: unknown[] }).steps.length, 2);

  const listed = await invokeResult(fabric, { nodeId: "pi_pe", provide: "list_pipelines", input: {} });
  assert.equal(listed.ok, true);
  if (listed.ok) assert.equal((listed.output as { pipelines: unknown[] }).pipelines.length, 1);

  const removed = await invokeResult(fabric, { nodeId: "pi_pe", provide: "delete_pipeline", input: { id: "mapped", confirm: true } });
  assert.equal(removed.ok, true);
  assert.equal(fabric.describeNode("pi_pe_pipeline_mapped"), undefined);
});
