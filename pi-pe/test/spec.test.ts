import assert from "node:assert/strict";
import test from "node:test";
import { createProtocolFabric } from "@kybernetria/pi-protocol";
import { validatePipelineCandidate } from "../src/pipeline/validate.ts";
import { fixture, installTestNode, registerMappedFixtures, resolverFrom } from "./helpers.ts";

test("a fully mapped two-step spec receives static assurance", async () => {
  const fabric = createProtocolFabric();
  registerMappedFixtures(fabric);
  const report = validatePipelineCandidate(await fixture("mapped.pipeline.json"), resolverFrom(fabric)).report;
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.assurance, "static", JSON.stringify(report.warnings));
  assert.equal(report.dependencies.length, 2);
  assert.equal(report.generatedTarget, "pi_pe_pipeline_mapped.run");
});

test("unsafe IDs, empty pipelines, over-limit pipelines, and unknown targets fail", async () => {
  const fabric = createProtocolFabric();
  const base = await fixture("mapped.pipeline.json");
  for (const id of ["../escape", "Upper", "has/slash", ""]) {
    const report = validatePipelineCandidate({ ...base, id }, resolverFrom(fabric)).report;
    assert.equal(report.valid, false);
  }
  const empty = validatePipelineCandidate({ ...base, steps: [] }, resolverFrom(fabric)).report;
  assert(empty.errors.some((error) => error.code === "EMPTY_PIPELINE"));
  const tooMany = validatePipelineCandidate({ ...base, limits: { maxSteps: 1 }, steps: base.steps }, resolverFrom(fabric)).report;
  assert(tooMany.errors.some((error) => error.code === "STEP_LIMIT"));
  const missing = validatePipelineCandidate(base, resolverFrom(fabric)).report;
  assert(missing.errors.some((error) => error.code === "DEPENDENCY_NOT_FOUND"));
});

test("later-step references, unmapped required inputs, and self references fail", async () => {
  const fabric = createProtocolFabric();
  registerMappedFixtures(fabric);
  const base = await fixture("mapped.pipeline.json");
  const laterReference = structuredClone(base);
  laterReference.steps[0].input = { mode: "pass", from: { source: "step", stepId: "wrap" } };
  assert(validatePipelineCandidate(laterReference, resolverFrom(fabric)).report.errors.some((error) => error.code === "INVALID_SOURCE"));

  const unmapped = structuredClone(base);
  if (unmapped.steps[1].input.mode === "object") unmapped.steps[1].input.constants = [];
  assert(validatePipelineCandidate(unmapped, resolverFrom(fabric)).report.errors.some((error) => error.code === "REQUIRED_INPUT_UNMAPPED"));

  const self = structuredClone(base);
  self.steps[0].target = "pi_pe_pipeline_mapped.run";
  assert(validatePipelineCandidate(self, resolverFrom(fabric)).report.errors.some((error) => error.code === "SELF_REFERENCE"));
});

test("broad pass-through schemas require runtime-only review", async () => {
  const fabric = createProtocolFabric();
  installTestNode(fabric, {
    node: {
      nodeId: "broad",
      purpose: "Broad target",
      provides: [{
        name: "run",
        description: "Broad target",
        inputSchema: {},
        outputSchema: {},
        execution: { type: "handler", handler: "run" },
      }],
    },
    handlers: { run: (input) => input },
  });
  const base = await fixture("passthrough.pipeline.json");
  const spec = { ...base, id: "broad-pipe", inputSchema: {}, outputSchema: {}, steps: [{ id: "broad", target: "broad.run", input: { mode: "pass", from: { source: "pipeline_input" } } }] };
  const report = validatePipelineCandidate(spec, resolverFrom(fabric)).report;
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.assurance, "runtime_only");
});
