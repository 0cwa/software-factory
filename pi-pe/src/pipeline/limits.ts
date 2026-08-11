import { DEFAULT_LIMITS, HARD_LIMITS } from "../config.ts";
import type { Issue, PipelineLimits, PipelineSpecV1 } from "../types.ts";

export interface EffectiveLimits {
  timeoutMs: number;
  maxSteps: number;
  maxIntermediateBytes: number;
  maxNestedDepth: number;
  maxInvocations: number;
}

export function effectiveLimits(limits?: PipelineLimits): EffectiveLimits {
  return {
    timeoutMs: limits?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
    maxSteps: limits?.maxSteps ?? DEFAULT_LIMITS.maxSteps,
    maxIntermediateBytes: limits?.maxIntermediateBytes ?? DEFAULT_LIMITS.maxIntermediateBytes,
    maxNestedDepth: limits?.maxNestedDepth ?? DEFAULT_LIMITS.maxNestedDepth,
    maxInvocations: limits?.maxInvocations ?? DEFAULT_LIMITS.maxInvocations,
  };
}

export function validatePipelineLimits(spec: PipelineSpecV1): Issue[] {
  const issues: Issue[] = [];
  const limits = effectiveLimits(spec.limits);
  check("timeoutMs", limits.timeoutMs, HARD_LIMITS.timeoutMs, issues);
  check("maxSteps", limits.maxSteps, HARD_LIMITS.maxSteps, issues);
  check("maxIntermediateBytes", limits.maxIntermediateBytes, HARD_LIMITS.maxIntermediateBytes, issues);
  check("maxNestedDepth", limits.maxNestedDepth, HARD_LIMITS.maxNestedDepth, issues);
  check("maxInvocations", limits.maxInvocations, HARD_LIMITS.maxInvocations, issues);
  if (spec.steps.length === 0) issues.push({ code: "EMPTY_PIPELINE", message: "a pipeline must contain at least one step", path: "/steps" });
  if (spec.steps.length > limits.maxSteps) issues.push({ code: "STEP_LIMIT", message: `pipeline has ${spec.steps.length} steps but maxSteps is ${limits.maxSteps}`, path: "/steps" });
  if (spec.steps.length > limits.maxInvocations) issues.push({ code: "INVOCATION_LIMIT", message: `pipeline has ${spec.steps.length} steps but maxInvocations is ${limits.maxInvocations}`, path: "/steps" });
  for (const [index, step] of spec.steps.entries()) {
    if (step.timeoutMs !== undefined && step.timeoutMs > HARD_LIMITS.timeoutMs) {
      issues.push({ code: "STEP_TIMEOUT_LIMIT", message: `step timeout exceeds hard limit ${HARD_LIMITS.timeoutMs}`, path: `/steps/${index}/timeoutMs`, stepId: step.id });
    }
  }
  return issues;
}

function check(name: keyof EffectiveLimits, value: number, hard: number, issues: Issue[]): void {
  if (!Number.isInteger(value) || value <= 0 || value > hard) {
    issues.push({ code: "LIMIT_EXCEEDED", message: `${name} must be between 1 and ${hard}`, path: `/limits/${name}` });
  }
}
