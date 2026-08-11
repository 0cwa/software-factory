import { PipelineError } from "../errors.ts";
import type { PipelineSpecV1, PipelineStepV1, ValueSource } from "../types.ts";
import { assertNonConflictingPointers, getPointer, MISSING, setPointer } from "./pointers.ts";

export interface MappingContext {
  pipelineInput: unknown;
  outputs: ReadonlyMap<string, unknown>;
  previousStepId?: string;
}

export function constructStepInput(step: PipelineStepV1, context: MappingContext): unknown {
  try {
    if (step.input.mode === "pass") {
      const selected = resolveValueSource(step.input.from, context);
      if (selected === MISSING) throw new Error(`source ${formatSource(step.input.from)} is missing`);
      return selected;
    }

    const destinations = [
      ...step.input.bindings.map((binding) => binding.to),
      ...(step.input.constants ?? []).map((constant) => constant.to),
    ];
    assertNonConflictingPointers(destinations);
    const result: Record<string, unknown> = {};
    for (const binding of step.input.bindings) {
      const selected = resolveValueSource(binding.from, context);
      if (selected === MISSING) {
        if (binding.required === true) throw new Error(`required source ${formatSource(binding.from)} is missing`);
        continue;
      }
      setPointer(result, binding.to, selected);
    }
    for (const constant of step.input.constants ?? []) setPointer(result, constant.to, constant.value);
    return result;
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    throw new PipelineError("MAPPING_FAILED", `step ${step.id}: ${error instanceof Error ? error.message : String(error)}`, {
      stepId: step.id,
      target: step.target,
    }, { cause: error });
  }
}

export function resolveValueSource(source: ValueSource, context: MappingContext): unknown | typeof MISSING {
  let value: unknown;
  switch (source.source) {
    case "pipeline_input":
      value = context.pipelineInput;
      break;
    case "previous":
      if (!context.previousStepId || !context.outputs.has(context.previousStepId)) return MISSING;
      value = context.outputs.get(context.previousStepId);
      break;
    case "step":
      if (!context.outputs.has(source.stepId)) return MISSING;
      value = context.outputs.get(source.stepId);
      break;
  }
  return getPointer(value, source.pointer ?? "");
}

export function selectPipelineOutput(spec: PipelineSpecV1, pipelineInput: unknown, outputs: ReadonlyMap<string, unknown>): unknown {
  const last = spec.steps.at(-1)?.id;
  const source = spec.output ?? (last ? { source: "step" as const, stepId: last } : { source: "pipeline_input" as const });
  try {
    const selected = resolveValueSource(source, { pipelineInput, outputs, previousStepId: last });
    if (selected === MISSING) throw new Error(`final source ${formatSource(source)} is missing`);
    return selected;
  } catch (error) {
    throw new PipelineError("FINAL_OUTPUT_INVALID", error instanceof Error ? error.message : String(error), undefined, { cause: error });
  }
}

export function formatSource(source: ValueSource): string {
  const origin = source.source === "step" ? `step:${source.stepId}` : source.source;
  return `${origin}${source.pointer ?? ""}`;
}
