import assert from "node:assert/strict";
import test from "node:test";
import { PipelineError } from "../src/errors.ts";
import { constructStepInput } from "../src/pipeline/map-input.ts";
import type { PipelineStepV1 } from "../src/types.ts";

test("object mapping combines sources and deep-cloned constants", () => {
  const constant = { nested: [1, 2] };
  const step: PipelineStepV1 = {
    id: "map",
    target: "fixture.target",
    input: {
      mode: "object",
      bindings: [
        { to: "/query", from: { source: "pipeline_input", pointer: "/query" }, required: true },
        { to: "/prior/value", from: { source: "previous", pointer: "/value" }, required: true },
        { to: "/optional", from: { source: "pipeline_input", pointer: "/missing" } },
      ],
      constants: [{ to: "/config", value: constant }],
    },
  };
  const output = constructStepInput(step, {
    pipelineInput: { query: "hello" },
    outputs: new Map([["one", { value: 42 }]]),
    previousStepId: "one",
  }) as { config: { nested: number[] } };
  assert.deepEqual(output, { query: "hello", prior: { value: 42 }, config: constant });
  output.config.nested.push(3);
  assert.deepEqual(constant, { nested: [1, 2] });
});

test("missing required source fails with a step-qualified mapping error", () => {
  const step: PipelineStepV1 = {
    id: "map",
    target: "fixture.target",
    input: {
      mode: "object",
      bindings: [{ to: "/required", from: { source: "pipeline_input", pointer: "/missing" }, required: true }],
    },
  };
  assert.throws(
    () => constructStepInput(step, { pipelineInput: {}, outputs: new Map() }),
    (error) => error instanceof PipelineError && error.code === "MAPPING_FAILED" && /step map/.test(error.message),
  );
});

test("pass mode preserves a complete selected value", () => {
  const previous = { value: null };
  const step: PipelineStepV1 = {
    id: "pass",
    target: "fixture.target",
    input: { mode: "pass", from: { source: "previous" } },
  };
  assert.equal(constructStepInput(step, { pipelineInput: {}, outputs: new Map([["one", previous]]), previousStepId: "one" }), previous);
});
