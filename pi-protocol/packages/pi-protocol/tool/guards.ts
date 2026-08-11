import type { ProtocolTraceDetails } from "./trace.ts";

export function isInvokeToolResult(
  result: unknown,
): result is { ok: true; schemaVersion: 1; op: "call"; state?: "running" | "completed" | "failed" | "aborted" | "outcome_unknown"; toolCallId?: string; result: { ok: boolean; error?: { code?: string; message?: string } }; trace?: ProtocolTraceDetails } {
  return isPlainObject(result) && result.ok === true && result.schemaVersion === 1 && result.op === "call" && isPlainObject(result.result);
}

export function isSuccessfulInvokeToolResult(
  result: unknown,
): result is { ok: true; schemaVersion: 1; op: "call"; result: { ok: true; output: unknown } } {
  return isInvokeToolResult(result) && result.result.ok === true && "output" in result.result;
}

export function isTextObject(value: unknown): value is { text: string } {
  return isPlainObject(value) && typeof value.text === "string" && Object.keys(value).length === 1;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
