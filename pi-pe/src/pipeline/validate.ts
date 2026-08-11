import type { JsonSchemaLite } from "@kybernetria/pi-protocol/core";
import { HARD_LIMITS } from "../config.ts";
import { generatedTarget, parsePipelineSpec, parseTarget } from "../schemas.ts";
import type {
  DependencySnapshot,
  Issue,
  PipelineSpecV1,
  ResolvedTarget,
  TargetResolver,
  ValidationReport,
  ValueSource,
} from "../types.ts";
import { checkSchemaCompatibility, inferLiteralSchema } from "./compatibility.ts";
import { createDependencySnapshot } from "./fingerprints.ts";
import { validatePipelineLimits } from "./limits.ts";
import { assertNonConflictingPointers, parseJsonPointer, SchemaSelection, selectSchema } from "./pointers.ts";

export interface ValidationOutcome {
  report: ValidationReport;
  spec?: PipelineSpecV1;
  resolved: Map<string, ResolvedTarget>;
}

export function validatePipelineCandidate(value: unknown, resolveTarget: TargetResolver): ValidationOutcome {
  const parsed = parsePipelineSpec(value);
  if (!parsed.spec) {
    return {
      report: { valid: false, assurance: "invalid", errors: parsed.errors, warnings: [], dependencies: [] },
      resolved: new Map(),
    };
  }
  return validateParsedPipeline(parsed.spec, resolveTarget, parsed.errors);
}

export function validateParsedPipeline(spec: PipelineSpecV1, resolveTarget: TargetResolver, initialErrors: Issue[] = []): ValidationOutcome {
  const errors = [...initialErrors, ...validatePipelineLimits(spec)];
  const warnings: Issue[] = [];
  let runtimeOnly = false;
  const resolved = new Map<string, ResolvedTarget>();
  const dependencies: DependencySnapshot[] = [];
  const ownTarget = generatedTarget(spec.id);

  const stepIds = new Set<string>();
  const stepOrder = new Map<string, number>();
  for (const [index, step] of spec.steps.entries()) {
    if (stepIds.has(step.id)) errors.push(issue("DUPLICATE_STEP_ID", `duplicate step id ${step.id}`, `/steps/${index}/id`, step.id));
    else {
      stepIds.add(step.id);
      stepOrder.set(step.id, index);
    }
    if (step.target === ownTarget) errors.push(issue("SELF_REFERENCE", `pipeline cannot invoke its own generated target ${ownTarget}`, `/steps/${index}/target`, step.id, step.target));
    if (step.timeoutMs !== undefined && step.timeoutMs > HARD_LIMITS.timeoutMs) {
      errors.push(issue("STEP_TIMEOUT_LIMIT", `step timeout exceeds ${HARD_LIMITS.timeoutMs}`, `/steps/${index}/timeoutMs`, step.id));
    }

    if (!resolved.has(step.target)) {
      const target = resolveTarget(step.target);
      if (!target) errors.push(issue("DEPENDENCY_NOT_FOUND", `target is not registered: ${step.target}`, `/steps/${index}/target`, step.id, step.target));
      else {
        resolved.set(step.target, target);
        dependencies.push(createDependencySnapshot(step.target, target));
      }
    }
  }

  const outputSchemas = new Map<string, JsonSchemaLite>();
  for (const [index, step] of spec.steps.entries()) {
    const target = resolved.get(step.target);
    if (!target) continue;
    if (step.input.mode === "pass") {
      const source = resolveSourceSchema(step.input.from, spec, index, outputSchemas, stepOrder);
      addSourceProblems(source, errors, warnings, step.id, `/steps/${index}/input/from`, (isRuntime) => { runtimeOnly ||= isRuntime; });
      if (!source.error) {
        const compatibility = checkSchemaCompatibility(source.schema, target.provide.inputSchema, `step ${step.id} input`);
        applyCompatibility(compatibility, errors, warnings, step.id, step.target, `/steps/${index}/input`, (isRuntime) => { runtimeOnly ||= isRuntime; });
      }
    } else {
      const pointers = [
        ...step.input.bindings.map((binding) => binding.to),
        ...(step.input.constants ?? []).map((constant) => constant.to),
      ];
      try {
        for (const pointer of pointers) {
          if (!pointer) throw new Error("destination pointer may not select the root");
          parseJsonPointer(pointer, true);
        }
        assertNonConflictingPointers(pointers);
      } catch (error) {
        errors.push(issue("INVALID_DESTINATION_POINTER", (error as Error).message, `/steps/${index}/input`, step.id, step.target));
      }

      const guaranteedTopLevel = new Set<string>();
      for (const [bindingIndex, binding] of step.input.bindings.entries()) {
        const path = `/steps/${index}/input/bindings/${bindingIndex}`;
        const source = resolveSourceSchema(binding.from, spec, index, outputSchemas, stepOrder);
        addSourceProblems(source, errors, warnings, step.id, `${path}/from`, (isRuntime) => { runtimeOnly ||= isRuntime; });
        let destination: SchemaSelection;
        try {
          destination = selectSchema(target.provide.inputSchema, binding.to);
        } catch (error) {
          errors.push(issue("INVALID_DESTINATION_POINTER", (error as Error).message, `${path}/to`, step.id, step.target));
          continue;
        }
        if (destination.error) {
          warnings.push(issue("DESTINATION_SCHEMA_UNKNOWN", destination.error, `${path}/to`, step.id, step.target));
          runtimeOnly = true;
        } else if (!source.error) {
          const compatibility = checkSchemaCompatibility(source.schema, destination.schema, `binding ${binding.to}`);
          applyCompatibility(compatibility, errors, warnings, step.id, step.target, path, (isRuntime) => { runtimeOnly ||= isRuntime; });
        }
        if (!source.guaranteed) {
          warnings.push(issue("SOURCE_NOT_GUARANTEED", `${formatSource(binding.from)} is not guaranteed by its declared schema`, `${path}/from`, step.id, step.target));
          runtimeOnly = true;
        }
        if (binding.required === true || source.guaranteed) addTopLevel(binding.to, guaranteedTopLevel);
      }

      for (const [constantIndex, constant] of (step.input.constants ?? []).entries()) {
        const path = `/steps/${index}/input/constants/${constantIndex}`;
        const destination = selectSchema(target.provide.inputSchema, constant.to);
        if (destination.error) {
          warnings.push(issue("DESTINATION_SCHEMA_UNKNOWN", destination.error, `${path}/to`, step.id, step.target));
          runtimeOnly = true;
        } else {
          const compatibility = checkSchemaCompatibility(inferLiteralSchema(constant.value), destination.schema, `constant ${constant.to}`);
          applyCompatibility(compatibility, errors, warnings, step.id, step.target, path, (isRuntime) => { runtimeOnly ||= isRuntime; });
        }
        addTopLevel(constant.to, guaranteedTopLevel);
      }

      for (const required of target.provide.inputSchema.required ?? []) {
        if (!guaranteedTopLevel.has(required)) {
          errors.push(issue("REQUIRED_INPUT_UNMAPPED", `required target input property ${required} is not guaranteed by a binding or constant`, `/steps/${index}/input`, step.id, step.target));
        }
      }
      if (!target.provide.inputSchema.properties || Object.keys(target.provide.inputSchema.properties).length === 0 || target.provide.inputSchema.type === undefined) {
        warnings.push(issue("BROAD_TARGET_INPUT", `target ${step.target} has a broad input schema`, `/steps/${index}/input`, step.id, step.target));
        runtimeOnly = true;
      }
    }
    outputSchemas.set(step.id, target.provide.outputSchema);
  }

  if (spec.steps.length > 0) {
    const outputSource = spec.output ?? { source: "step" as const, stepId: spec.steps[spec.steps.length - 1].id };
    const selected = resolveSourceSchema(outputSource, spec, spec.steps.length, outputSchemas, stepOrder);
    addSourceProblems(selected, errors, warnings, undefined, "/output", (isRuntime) => { runtimeOnly ||= isRuntime; });
    if (!selected.error) {
      const compatibility = checkSchemaCompatibility(selected.schema, spec.outputSchema, "pipeline output");
      applyCompatibility(compatibility, errors, warnings, undefined, ownTarget, "/output", (isRuntime) => { runtimeOnly ||= isRuntime; }, "FINAL_OUTPUT_INCOMPATIBLE");
    }
  }

  const assurance = errors.length > 0 ? "invalid" : runtimeOnly ? "runtime_only" : "static";
  return {
    spec,
    resolved,
    report: {
      valid: errors.length === 0,
      assurance,
      errors,
      warnings,
      dependencies,
      generatedTarget: ownTarget,
    },
  };
}

function resolveSourceSchema(
  source: ValueSource,
  spec: PipelineSpecV1,
  currentStepIndex: number,
  outputSchemas: ReadonlyMap<string, JsonSchemaLite>,
  stepOrder: ReadonlyMap<string, number>,
): SchemaSelection {
  let base: JsonSchemaLite;
  if (source.source === "pipeline_input") base = spec.inputSchema;
  else if (source.source === "previous") {
    if (currentStepIndex <= 0) return { schema: {}, known: false, guaranteed: false, error: "previous cannot be used by the first step" };
    const previousId = spec.steps[currentStepIndex - 1]?.id;
    const previousSchema = previousId ? outputSchemas.get(previousId) : undefined;
    if (!previousSchema) return { schema: {}, known: false, guaranteed: false, error: "previous step output schema is unavailable" };
    base = previousSchema;
  } else {
    const order = stepOrder.get(source.stepId);
    if (order === undefined) return { schema: {}, known: false, guaranteed: false, error: `referenced step does not exist: ${source.stepId}` };
    if (order >= currentStepIndex) return { schema: {}, known: false, guaranteed: false, error: `step source must reference an earlier step: ${source.stepId}` };
    const selected = outputSchemas.get(source.stepId);
    if (!selected) return { schema: {}, known: false, guaranteed: false, error: `step output schema is unavailable: ${source.stepId}` };
    base = selected;
  }
  return selectSchema(base, source.pointer ?? "");
}

function addSourceProblems(
  selected: SchemaSelection,
  errors: Issue[],
  warnings: Issue[],
  stepId: string | undefined,
  path: string,
  markRuntime: (runtime: boolean) => void,
): void {
  if (selected.error) errors.push(issue("INVALID_SOURCE", selected.error, path, stepId));
  else if (!selected.known) {
    warnings.push(issue("SOURCE_SCHEMA_UNKNOWN", "source schema cannot be proven statically", path, stepId));
    markRuntime(true);
  }
}

function applyCompatibility(
  compatibility: ReturnType<typeof checkSchemaCompatibility>,
  errors: Issue[],
  warnings: Issue[],
  stepId: string | undefined,
  target: string,
  path: string,
  markRuntime: (runtime: boolean) => void,
  invalidCode = "SCHEMA_INCOMPATIBLE",
): void {
  if (compatibility.kind === "incompatible") {
    errors.push(issue(invalidCode, compatibility.reasons.join("; ") || "schemas are incompatible", path, stepId, target));
  } else if (compatibility.kind === "unknown") {
    warnings.push(issue("SCHEMA_RUNTIME_ONLY", compatibility.reasons.join("; ") || "schema compatibility is unknown", path, stepId, target));
    markRuntime(true);
  }
}

function addTopLevel(pointer: string, destination: Set<string>): void {
  try {
    const first = parseJsonPointer(pointer, true)[0];
    if (first !== undefined) destination.add(first);
  } catch {
    // The pointer validation issue is reported separately.
  }
}

function formatSource(source: ValueSource): string {
  return `${source.source}${source.source === "step" ? `:${source.stepId}` : ""}${source.pointer ?? ""}`;
}

function issue(code: string, message: string, path?: string, stepId?: string, target?: string): Issue {
  return { code, message, ...(path ? { path } : {}), ...(stepId ? { stepId } : {}), ...(target ? { target } : {}) };
}
