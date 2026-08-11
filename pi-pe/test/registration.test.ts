async function invokeResult(fabric: { invokeTracked(request: any): Promise<any> }, request: any): Promise<any> {
  return (await fabric.invokeTracked(request)).result;
}

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProtocolFabric } from "@kybernetria/pi-protocol";
import { PipelineError } from "../src/errors.ts";
import { PipelineService } from "../src/pipeline/service.ts";
import { PipelineRepository } from "../src/storage/repository.ts";
import { disposeTestNode, fixture, installTestNode, registerMappedFixtures } from "./helpers.ts";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-registration-"));
  const fabric = createProtocolFabric();
  registerMappedFixtures(fabric);
  const service = new PipelineService(fabric, new PipelineRepository(root));
  await service.initialize();
  return { root, fabric, service };
}

test("save registers a stable generated handler and survives reconciliation", async () => {
  const { root, fabric, service } = await setup();
  const saved = await service.save(await fixture("mapped.pipeline.json"));
  assert.equal(saved.generatedTarget, "pi_pe_pipeline_mapped.run");
  assert.equal(saved.status.registered, true);
  assert(fabric.describeProvide("pi_pe_pipeline_mapped", "run"));

  const invoked = await invokeResult(fabric, { nodeId: "pi_pe_pipeline_mapped", provide: "run", input: { text: "reload" } });
  assert.equal(invoked.ok, true);
  if (invoked.ok) assert.deepEqual(invoked.output, { result: "Result: RELOAD" });

  const persisted = JSON.parse(await readFile(join(root, "pipelines", "mapped", "pipeline.json"), "utf8"));
  assert.equal(persisted.dependencies.length, 2);
  assert.equal(persisted.review.runtimeOnly, false);
  const generated = JSON.parse(await readFile(join(root, "pipelines", "mapped", "pi.protocol.json"), "utf8"));
  assert.equal(generated.node.id, "pi_pe_pipeline_mapped");

  await service.dispose();
  const replacementService = new PipelineService(fabric, new PipelineRepository(root));
  const statuses = await replacementService.initialize();
  assert.equal(statuses[0].status, "enabled");
  const reloaded = await invokeResult(fabric, { nodeId: "pi_pe_pipeline_mapped", provide: "run", input: { text: "again" } });
  assert.equal(reloaded.ok, true);
});

test("runtime-only save needs explicit review and delete needs confirmation", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-runtime-only-"));
  const fabric = createProtocolFabric();
  installTestNode(fabric, {
    node: {
      nodeId: "broad",
      purpose: "broad",
      provides: [{ name: "run", description: "broad", inputSchema: {}, outputSchema: {}, execution: { type: "handler", handler: "run" } }],
    },
    handlers: { run: (input) => input },
  });
  const service = new PipelineService(fabric, new PipelineRepository(root));
  await service.initialize();
  const base = await fixture("passthrough.pipeline.json");
  const spec = { ...base, id: "reviewed", inputSchema: {}, outputSchema: {}, steps: [{ id: "run", target: "broad.run", input: { mode: "pass", from: { source: "pipeline_input" } } }] };
  await assert.rejects(() => service.save(spec), (error) => error instanceof PipelineError && error.code === "PIPELINE_INVALID" && /allowRuntimeOnly/.test(error.message));
  const saved = await service.save(spec, { allowRuntimeOnly: true });
  assert.equal(saved.spec.review?.runtimeOnly, true);
  await assert.rejects(() => service.delete("reviewed", false), /confirm/);
  assert.deepEqual(await service.delete("reviewed", true), { deleted: true, id: "reviewed", disabledDependents: [] });
  assert.equal(fabric.describeNode("pi_pe_pipeline_reviewed"), undefined);
});

test("corrupt specs are quarantined while unrelated pipelines remain registered", async () => {
  const { root, fabric, service } = await setup();
  await service.save(await fixture("mapped.pipeline.json"));
  const badDirectory = join(root, "pipelines", "corrupt");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(badDirectory, { recursive: true }));
  await writeFile(join(badDirectory, "pipeline.json"), "{not-json", "utf8");
  const statuses = await service.reload();
  assert.equal(statuses.find((item) => item.id === "corrupt")?.status, "quarantined");
  assert.equal(statuses.find((item) => item.id === "mapped")?.status, "enabled");
  assert(fabric.describeNode("pi_pe_pipeline_mapped"));
});

test("compatible policy permits a version-only reviewed contract change", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-pe-compatible-"));
  const fabric = createProtocolFabric();
  const register = (version: string) => installTestNode(fabric, {
    node: {
      nodeId: "stable",
      purpose: "stable contract",
      version,
      provides: [{
        name: "echo",
        description: "echo",
        version,
        inputSchema: { type: "string" },
        outputSchema: { type: "string" },
        execution: { type: "handler", handler: "echo" },
      }],
    },
    handlers: { echo: (input) => input },
  });
  register("1.0.0");
  const service = new PipelineService(fabric, new PipelineRepository(root));
  await service.initialize();
  const base = await fixture("passthrough.pipeline.json");
  await service.save({
    ...base,
    id: "compatible",
    dependencyPolicy: "compatible",
    steps: [{ id: "echo", target: "stable.echo", input: { mode: "pass", from: { source: "pipeline_input" } } }],
  });
  await disposeTestNode(fabric, "stable");
  register("2.0.0");
  const statuses = await service.reload();
  assert.equal(statuses.find((item) => item.id === "compatible")?.status, "enabled");
});

test("a changed pinned dependency disables its generated pipeline", async () => {
  const { fabric, service } = await setup();
  await service.save(await fixture("mapped.pipeline.json"));
  await disposeTestNode(fabric, "fixture");
  // Same targets, changed upper input schema and node version.
  installTestNode(fabric, {
    node: {
      nodeId: "fixture",
      purpose: "changed",
      version: "2.0.0",
      provides: [
        { name: "upper", description: "changed", inputSchema: { type: "number" }, outputSchema: { type: "object" }, execution: { type: "handler", handler: "upper" } },
        { name: "wrap", description: "changed", inputSchema: { type: "object" }, outputSchema: { type: "object" }, execution: { type: "handler", handler: "wrap" } },
      ],
    },
    handlers: { upper: (input) => input, wrap: (input) => input },
  });
  const statuses = await service.reload();
  assert.equal(statuses.find((item) => item.id === "mapped")?.status, "disabled");
  assert.equal(fabric.describeNode("pi_pe_pipeline_mapped"), undefined);
});
