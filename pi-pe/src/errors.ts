export type PipelineErrorCode =
  | "PIPELINE_NOT_FOUND"
  | "PIPELINE_INVALID"
  | "DEPENDENCY_NOT_FOUND"
  | "DEPENDENCY_CHANGED"
  | "MAPPING_FAILED"
  | "STEP_INPUT_INVALID"
  | "STEP_FAILED"
  | "STEP_OUTPUT_TOO_LARGE"
  | "PIPELINE_TIMEOUT"
  | "PIPELINE_ABORTED"
  | "PIPELINE_CYCLE"
  | "FINAL_OUTPUT_INVALID";

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PipelineErrorCode, message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super(`[${code}] ${message}`, options);
    this.name = "PipelineError";
    this.code = code;
    this.details = details;
  }
}

export function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));
}
