import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProtocolFabric } from "@kybernetria/pi-protocol";
import { assertPipelinesAcyclic, findPipelineCycles } from "../src/pipeline/cycles.ts";
import { PipelineError } from "../src/errors.ts";
import { createGeneratedManifest } from "../src/generated/manifest.ts";
import { PipelineService } from "../src/pipeline/service.ts";
import { PipelineRepository } from "../src/storage/repository.ts";
import { fixture } from "./helpers.ts";

test("direct and indirect generated-pipeline cycles report exact paths", async () => {
  const a = await fixture("cycle-a.pipeline.json");
  const b = await fixture("cycle-b.pipeline.json");
  const cycles = findPipelineCycles([a, b]);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], ["pi_pe_pipeline_cycle-a.run", "pi_pe_pipeline_cycle-b.run", "pi_pe_pipeline_cycle-a.run"]);
  assert.throws(
    () => assertPipelinesAcyclic([a, b]),
    (error) => error instanceof PipelineError && error.code === "PIPELINE_CYCLE" && /cycle-a.*cycle-b.*cycle-a/.test(error.message),
  );

  const direct = structuredClone(a);
  direct.steps[0].target = "pi_pe_pipeline_cycle-a.run";
  assert.equal(findPipelineCycles([direct])[0].length, 2);
});

test("acyclic nested pipelines pass", async () => {
  const a = await fixture("cycle-a.pipeline.json");
  const b = await fixture("cycle-b.pipeline.json");
  b.steps[0].target = "external.echo";
  assert.deepEqual(findPipelineCycles([a, b]), []);
  assert.doesNotThrow(() => assertPipelinesAcyclic([a, b]));
});

test("management validation checks candidate cycles against persisted specs", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-cycle-validation-"));
  const repository = new PipelineRepository(root);
  const a = await fixture("cycle-a.pipeline.json");
  const b = await fixture("cycle-b.pipeline.json");
  await repository.persist(b, createGeneratedManifest(b));
  const service = new PipelineService(createProtocolFabric(), repository);
  await service.initialize();
  const report = await service.validate(a);
  assert.equal(report.valid, false);
  assert(report.errors.some((error) => error.code === "PIPELINE_CYCLE"));
});
