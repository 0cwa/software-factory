import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { invokeTrackedFromCurrentContext, type InvokeRequest, type InvokeResult, type ProtocolFabric } from "@kybernetria/pi-protocol/core";
import { PREVIEW_MAX_CHARS } from "../config.ts";
import { PipelineError } from "../errors.ts";
import { deepCloneJson, deepFreeze, jsonByteLength, validateJsonSchemaValue } from "../schemas.ts";
import type {
  DependencySnapshot,
  PipelineExecutionDetails,
  PipelineRunResult,
  PipelineRuntimeSnapshot,
  PipelineSpecV1,
  ProtocolInvocationContext,
  ResolvedTarget,
  StepTrace,
  TargetResolver,
} from "../types.ts";
import { assertPipelineDependencies } from "./dependencies.ts";
import { effectiveLimits } from "./limits.ts";
import { constructStepInput, selectPipelineOutput } from "./map-input.ts";

interface ActivePipelineState {
  stack: string[];
  invocationCount: number;
  maxInvocations: number;
  maxNestedDepth: number;
}

const activePipelines = new AsyncLocalStorage<ActivePipelineState>();

export function createRuntimeSnapshot(spec: PipelineSpecV1): PipelineRuntimeSnapshot {
  const immutable = deepFreeze(deepCloneJson(spec)) as Readonly<PipelineSpecV1>;
  const dependencies = new Map<string, Readonly<DependencySnapshot>>(
    (immutable.dependencies ?? []).map((dependency) => [dependency.target, dependency]),
  );
  return deepFreeze({ spec: immutable, dependencies, generatedTarget: `pi_pe_pipeline_${spec.id}.run` }) as PipelineRuntimeSnapshot;
}

export class PipelineExecutor {
  constructor(
    private readonly fabric: ProtocolFabric,
    private readonly resolveTarget: TargetResolver,
  ) {}

  async execute(snapshot: PipelineRuntimeSnapshot, pipelineInput: unknown, context?: ProtocolInvocationContext): Promise<PipelineRunResult> {
    const existing = activePipelines.getStore();
    const limits = effectiveLimits((snapshot.spec as PipelineSpecV1).limits);
    const state = existing ?? {
      stack: [],
      invocationCount: 0,
      maxInvocations: limits.maxInvocations,
      maxNestedDepth: limits.maxNestedDepth,
    };
    const operation = () => this.executeInState(snapshot, pipelineInput, state, context);
    return existing ? operation() : activePipelines.run(state, operation);
  }

  private async executeInState(
    snapshot: PipelineRuntimeSnapshot,
    pipelineInput: unknown,
    state: ActivePipelineState,
    context?: ProtocolInvocationContext,
  ): Promise<PipelineRunResult> {
    const spec = snapshot.spec as PipelineSpecV1;
    const limits = effectiveLimits(spec.limits);
    const target = snapshot.generatedTarget;
    if (state.stack.includes(target)) {
      throw new PipelineError("PIPELINE_CYCLE", `runtime pipeline cycle: ${[...state.stack, target].join(" -> ")}`, { path: [...state.stack, target] });
    }
    const nestedDepthLimit = Math.min(state.maxNestedDepth, limits.maxNestedDepth);
    if (state.stack.length >= nestedDepthLimit) {
      throw new PipelineError("PIPELINE_CYCLE", `nested pipeline depth exceeds ${nestedDepthLimit}`, { stack: [...state.stack, target] });
    }
    if (spec.steps.length > limits.maxSteps) throw new PipelineError("PIPELINE_INVALID", `step count exceeds ${limits.maxSteps}`);

    const declaredInputError = validateJsonSchemaValue(spec.inputSchema, pipelineInput, "pipeline input");
    if (declaredInputError) throw new PipelineError("PIPELINE_INVALID", declaredInputError);

    const currentDependencies = assertPipelineDependencies(spec, this.resolveTarget);
    const invocationStart = state.invocationCount;
    const runId = `pi_pe_run_${randomUUID()}`;
    const startedAt = Date.now();
    const traces: StepTrace[] = [];
    const completedSideEffectingSteps: PipelineExecutionDetails["completedSideEffectingSteps"] = [];
    const outputs = new Map<string, unknown>();
    let retainedBytes = 0;
    let previousStepId: string | undefined;
    let executionStatus: PipelineExecutionDetails["status"] = "failed";

    const pipelineAbort = createCombinedAbort(context?.abortSignal);
    const pipelineTimer = setTimeout(() => pipelineAbort.abort("pipeline_timeout"), limits.timeoutMs);
    state.stack.push(target);
    try {
      for (const step of spec.steps) {
        if (pipelineAbort.signal.aborted) throw abortError(pipelineAbort.reason(), step.id);
        state.invocationCount += 1;
        const localInvocations = state.invocationCount - invocationStart;
        if (state.invocationCount > state.maxInvocations || localInvocations > limits.maxInvocations) {
          const invocationLimit = state.invocationCount > state.maxInvocations ? state.maxInvocations : limits.maxInvocations;
          throw new PipelineError("PIPELINE_CYCLE", `downstream invocation count exceeds ${invocationLimit}`, {
            invocationCount: state.invocationCount,
            localInvocations,
          });
        }

        const dependency = currentDependencies.get(step.target);
        if (!dependency) throw new PipelineError("DEPENDENCY_NOT_FOUND", `dependency is unavailable: ${step.target}`);
        const input = constructStepInput(step, { pipelineInput, outputs, previousStepId });
        const inputError = validateJsonSchemaValue(dependency.provide.inputSchema, input, `step ${step.id} input`);
        if (inputError) throw new PipelineError("STEP_INPUT_INVALID", inputError, { stepId: step.id, target: step.target });

        const stepStartedAt = Date.now();
        const stepAbort = createCombinedAbort(pipelineAbort.signal);
        const stepTimeout = Math.min(step.timeoutMs ?? limits.timeoutMs, limits.timeoutMs);
        const stepTimer = setTimeout(() => stepAbort.abort("step_timeout"), stepTimeout);
        let result: InvokeResult;
        try {
          const parsed = splitTarget(step.target);
          result = await invokeWithAbort(this.fabric, {
            nodeId: parsed.nodeId,
            provide: parsed.provide,
            input,
            abortSignal: stepAbort.signal,
          }, stepAbort.signal);
        } catch (error) {
          const durationMs = Date.now() - stepStartedAt;
          traces.push({ stepId: step.id, target: step.target, status: stepAbort.signal.aborted ? "aborted" : "failed", durationMs });
          if (pipelineAbort.signal.aborted) throw abortError(pipelineAbort.reason(), step.id);
          if (stepAbort.signal.aborted) throw new PipelineError("PIPELINE_TIMEOUT", `step ${step.id} timed out after ${stepTimeout}ms`, { stepId: step.id, target: step.target });
          throw error;
        } finally {
          clearTimeout(stepTimer);
          stepAbort.cleanup();
        }

        const durationMs = Date.now() - stepStartedAt;
        if (!result.ok) {
          traces.push({
            stepId: step.id,
            target: step.target,
            status: result.error.code === "CANCELLED" ? "aborted" : "failed",
            durationMs,
            downstreamCode: result.error.code,
          });
          if (pipelineAbort.signal.aborted) throw abortError(pipelineAbort.reason(), step.id);
          if (result.error.code === "CANCELLED") throw new PipelineError("PIPELINE_ABORTED", `step ${step.id} was aborted`, { stepId: step.id, target: step.target });
          if (/\[PIPELINE_CYCLE\]/.test(result.error.message)) {
            throw new PipelineError("PIPELINE_CYCLE", `step ${step.id} encountered a nested pipeline cycle: ${result.error.message}`, { stepId: step.id, target: step.target });
          }
          throw new PipelineError("STEP_FAILED", `step ${step.id} (${step.target}) failed with ${result.error.code}: ${result.error.message}`, {
            stepId: step.id,
            target: step.target,
            downstreamCode: result.error.code,
          });
        }

        let bytes: number;
        try {
          bytes = jsonByteLength(result.output);
        } catch (error) {
          throw new PipelineError("STEP_OUTPUT_TOO_LARGE", `step ${step.id} output is not JSON-serializable`, { stepId: step.id, target: step.target }, { cause: error });
        }
        retainedBytes += bytes;
        if (retainedBytes > limits.maxIntermediateBytes) {
          throw new PipelineError("STEP_OUTPUT_TOO_LARGE", `retained intermediate output exceeds ${limits.maxIntermediateBytes} bytes at step ${step.id}`, {
            stepId: step.id,
            target: step.target,
            outputBytes: bytes,
            retainedBytes,
          });
        }
        outputs.set(step.id, result.output);
        previousStepId = step.id;
        traces.push({
          stepId: step.id,
          target: step.target,
          status: "succeeded",
          durationMs,
          outputBytes: bytes,
          outputHash: hashOutput(result.output),
          outputPreview: previewOutput(result.output),
        });
        const effects = [...new Set(dependency.provide.effects ?? [])].sort();
        if (effects.length > 0) completedSideEffectingSteps.push({ stepId: step.id, target: step.target, effects });
      }

      const output = selectPipelineOutput(spec, pipelineInput, outputs);
      const finalError = validateJsonSchemaValue(spec.outputSchema, output, "pipeline output");
      if (finalError) throw new PipelineError("FINAL_OUTPUT_INVALID", finalError);
      executionStatus = "succeeded";
      return {
        output,
        details: {
          runId,
          pipelineId: spec.id,
          target,
          status: executionStatus,
          durationMs: Date.now() - startedAt,
          steps: traces,
          completedSideEffectingSteps,
        },
      };
    } catch (error) {
      executionStatus = error instanceof PipelineError && error.code === "PIPELINE_ABORTED" ? "aborted" : "failed";
      const pipelineError = error instanceof PipelineError
        ? error
        : new PipelineError("STEP_FAILED", error instanceof Error ? error.message : String(error), undefined, { cause: error });
      const details: PipelineExecutionDetails = {
        runId,
        pipelineId: spec.id,
        target,
        status: executionStatus,
        durationMs: Date.now() - startedAt,
        steps: traces,
        completedSideEffectingSteps,
      };
      throw new PipelineError(pipelineError.code, pipelineError.message.replace(/^\[[A-Z_]+\]\s*/, ""), {
        ...(pipelineError.details ?? {}),
        execution: details,
      }, { cause: pipelineError });
    } finally {
      clearTimeout(pipelineTimer);
      pipelineAbort.cleanup();
      const popped = state.stack.pop();
      if (popped !== target) state.stack.length = 0;
    }
  }
}

function splitTarget(target: string): { nodeId: string; provide: string } {
  const dot = target.indexOf(".");
  return { nodeId: target.slice(0, dot), provide: target.slice(dot + 1) };
}

async function invokeWithAbort(
  fabric: ProtocolFabric,
  request: InvokeRequest,
  signal: AbortSignal,
): Promise<InvokeResult> {
  if (signal.aborted) throw abortException();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortException());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const tracked = await Promise.race([invokeTrackedFromCurrentContext(fabric, request), aborted]);
    return tracked.result;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function createCombinedAbort(parent?: AbortSignal): {
  signal: AbortSignal;
  abort: (reason: string) => void;
  reason: () => unknown;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let localReason: unknown;
  const onParent = () => {
    localReason = "caller_abort";
    controller.abort(parent?.reason);
  };
  if (parent?.aborted) onParent();
  else parent?.addEventListener("abort", onParent, { once: true });
  return {
    signal: controller.signal,
    abort(reason) {
      if (!controller.signal.aborted) {
        localReason = reason;
        controller.abort(reason);
      }
    },
    reason: () => localReason ?? controller.signal.reason,
    cleanup: () => parent?.removeEventListener("abort", onParent),
  };
}

function abortError(reason: unknown, stepId?: string): PipelineError {
  if (reason === "pipeline_timeout" || reason === "step_timeout") {
    return new PipelineError("PIPELINE_TIMEOUT", stepId ? `pipeline timed out at step ${stepId}` : "pipeline timed out", stepId ? { stepId } : undefined);
  }
  return new PipelineError("PIPELINE_ABORTED", stepId ? `pipeline aborted at step ${stepId}` : "pipeline aborted", stepId ? { stepId } : undefined);
}

function abortException(): Error {
  const error = new Error("Invocation aborted");
  error.name = "AbortError";
  return error;
}

function hashOutput(value: unknown): string {
  return createHash("sha256").update(safeStringify(value)).digest("hex");
}

function previewOutput(value: unknown): string {
  const text = typeof value === "string" ? value : safeStringify(value);
  return text.length <= PREVIEW_MAX_CHARS ? text : `${text.slice(0, PREVIEW_MAX_CHARS)}…`;
}

function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}
