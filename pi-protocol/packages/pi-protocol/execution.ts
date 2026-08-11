import type { CompiledProvideContract } from "./contract/types.ts";
import { createHandlerInvocationContext } from "./control.ts";
import type {
  InvokeRequest,
  InvokeResult,
  ProtocolAgentExecutor,
  ProtocolHandler,
  ProtocolExecutionEventEmitter,
} from "./types.ts";

export async function executeAdmittedProvide(input: {
  request: InvokeRequest;
  provenance: { traceId?: string; spanId?: string; parentSpanId?: string; callerNodeId?: string };
  provide: CompiledProvideContract;
  binding: ProtocolHandler | ProtocolAgentExecutor;
  emitExecutionEvent?: ProtocolExecutionEventEmitter;
}): Promise<InvokeResult> {
  if (input.request.abortSignal?.aborted) {
    return { ok: false, error: { code: "CANCELLED", message: "Invocation cancelled" } };
  }
  const inputValidation = input.provide.validateInput(input.request.input);
  if (!inputValidation.valid) {
    return { ok: false, error: { code: "INPUT_INVALID", message: formatContractIssue("input", inputValidation.issues[0]) } };
  }
  const controlled = createHandlerInvocationContext(input.request.nodeId, input.request.provide, input.provenance);
  const context = {
    ...controlled,
    session: input.request.session,
    abortSignal: controlled.signal ?? input.request.abortSignal,
    emitExecutionEvent: input.emitExecutionEvent,
  };
  try {
    const output = await input.binding(input.request.input, context);
    const outputValidation = input.provide.validateOutput(output);
    if (!outputValidation.valid) {
      return { ok: false, error: { code: "OUTPUT_INVALID", message: formatContractIssue("output", outputValidation.issues[0]) } };
    }
    return { ok: true, nodeId: input.request.nodeId, provide: input.request.provide, output };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: isAbortError(error) ? "CANCELLED" : "EXECUTION_FAILED",
        message: isAbortError(error) ? "Invocation cancelled" : error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function formatContractIssue(boundary: "input" | "output", issue: { path: string; message: string } | undefined): string {
  if (!issue) return `${boundary} does not satisfy the protocol contract`;
  return `${boundary}${issue.path || ""} ${issue.message}`;
}


function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.message === "Invocation aborted");
}
