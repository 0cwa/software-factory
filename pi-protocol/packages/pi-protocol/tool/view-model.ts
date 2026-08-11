import type { ExecutionEventV1, ProvenanceEventV1 } from "../provenance/events.ts";
import { isInvokeToolResult, isSuccessfulInvokeToolResult, isTextObject } from "./guards.ts";
import type { ProtocolToolExecutionResult, ProtocolToolInput } from "./types.ts";
import { normalizeProtocolToolInput } from "./actions.ts";

const MAX_TRACE_EVENTS = 256;
const MAX_TRACE_ROWS = 64;
const MAX_DEPTH = 12;
const MAX_OUTPUT_CHARS = 12_000;
const MAX_OUTPUT_LINES = 120;
const MAX_DISCOVERY_CHARS = 20_000;

export interface ProtocolTraceRowViewModel {
  readonly depth: number;
  readonly status: "running" | "succeeded" | "failed" | "aborted";
  readonly target: string;
  readonly caller?: string;
  readonly durationMs?: number;
  readonly errorCode?: string;
}

export interface ProtocolViewModel {
  readonly schemaVersion: 1;
  readonly kind: "discovery" | "invocation";
  readonly operation: string;
  readonly target?: string;
  readonly state?: "running" | "completed" | "failed" | "aborted" | "outcome_unknown";
  readonly trace: readonly ProtocolTraceRowViewModel[];
  readonly traceTruncated: boolean;
  readonly body?: string;
  readonly output?: string;
  readonly outputFormat?: "text" | "markdown";
  readonly outputTruncated: boolean;
  readonly progress?: string;
  readonly progressTruncated: boolean;
  readonly executorFacts: readonly string[];
  readonly toolCallId?: string;
}

export function projectProtocolViewModel(
  result: ProtocolToolExecutionResult,
  input: ProtocolToolInput | undefined,
  options: { expanded?: boolean; isPartial?: boolean } = {},
): ProtocolViewModel {
  const prepared = prepare(input);
  const details = result.details;
  if (!isInvokeToolResult(details)) {
    return freeze({
      schemaVersion: 1,
      kind: "discovery",
      operation: prepared.op ?? (prepared.target ? "call" : "list"),
      trace: [],
      traceTruncated: false,
      executorFacts: [],
      progressTruncated: false,
      body: boundText(result.content.map((item) => item.text).join("\n"), MAX_DISCOVERY_CHARS, 240).text,
      outputTruncated: false,
    });
  }

  const target = resolveTarget(prepared, details);
  const rows = traceRows(details.trace?.events ?? []);
  const rawOutput = isSuccessfulInvokeToolResult(details)
    ? outputText(details.result.output)
    : result.content.map((item) => item.text).join("\n");
  const outputBound = boundText(rawOutput, options.expanded ? MAX_OUTPUT_CHARS : 160, options.expanded ? MAX_OUTPUT_LINES : 1);
  const executionEvents = details.trace?.executionEvents ?? [];
  const progress = options.isPartial ? progressText(executionEvents) : undefined;
  const executorFacts = executionEvents
    .filter((event): event is Extract<ExecutionEventV1, { type: "executor.session" }> => event.type === "executor.session")
    .slice(-8)
    .map((event) => `${event.model.slice(0, 256)}${event.thinkingLevel ? ` (${event.thinkingLevel.slice(0, 40)})` : ""}`);
  const presentation = details as { presentation?: { contentType?: unknown } };
  return freeze({
    schemaVersion: 1,
    kind: "invocation",
    operation: "call",
    ...(target ? { target } : {}),
    ...(details.state ? { state: details.state } : {}),
    trace: rows.rows,
    traceTruncated: rows.truncated,
    executorFacts,
    ...(rawOutput ? { output: outputBound.text } : {}),
    outputFormat: presentation.presentation?.contentType === "text/markdown" ? "markdown" : "text",
    outputTruncated: outputBound.truncated,
    ...(progress ? { progress } : {}),
    progressTruncated: Boolean(options.isPartial) && (executionEvents.length > 64 || executionEvents.reduce((total, event) => total + (event.type === "executor.output_delta" ? event.textDelta.length : 0), 0) > 2_000),
    ...(details.toolCallId ? { toolCallId: details.toolCallId } : {}),
  });
}

export function formatProtocolToolResult(result: unknown): string {
  if (isSuccessfulInvokeToolResult(result)) return outputText(result.result.output);
  if (isInvokeToolResult(result) && !result.result.ok) {
    const code = result.result.error?.code ?? "FAILED";
    return `${code}: ${result.result.error?.message ?? "Invocation failed"}`;
  }
  return JSON.stringify(result, null, 2);
}

function traceRows(events: ProvenanceEventV1[]): { rows: ProtocolTraceRowViewModel[]; truncated: boolean } {
  const grouped = new Map<string, ProvenanceEventV1[]>();
  for (const event of events.slice(-MAX_TRACE_EVENTS)) {
    const list = grouped.get(event.invocationId) ?? [];
    list.push(event);
    grouped.set(event.invocationId, list);
  }
  const selected = [...grouped.values()].slice(-MAX_TRACE_ROWS);
  const parentByInvocation = new Map(selected.map((list) => [list[0]!.invocationId, list[0]!.parentInvocationId]));
  const depthOf = (event: ProvenanceEventV1): number => {
    let depth = 0;
    let parent = event.parentInvocationId;
    const seen = new Set<string>([event.invocationId]);
    while (parent && parentByInvocation.has(parent) && depth < MAX_DEPTH) {
      if (seen.has(parent)) return MAX_DEPTH;
      seen.add(parent);
      depth += 1;
      parent = parentByInvocation.get(parent);
    }
    return depth;
  };
  const rows = selected.map((list): ProtocolTraceRowViewModel => {
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const status: ProtocolTraceRowViewModel["status"] = last.type === "invocation.succeeded" ? "succeeded"
      : last.type === "invocation.cancelled" ? "aborted"
      : last.type === "invocation.failed" || last.type === "invocation.rejected" || last.type === "invocation.denied" ? "failed"
      : "running";
    return freeze({
      depth: depthOf(first),
      status,
      target: first.target,
      ...(last.durationMs !== undefined ? { durationMs: last.durationMs } : {}),
      ...(last.outcomeCode ? { errorCode: last.outcomeCode } : {}),
    });
  });
  return { rows, truncated: events.length > MAX_TRACE_EVENTS || grouped.size > MAX_TRACE_ROWS || rows.some((row) => row.depth >= MAX_DEPTH) };
}

function progressText(events: ExecutionEventV1[]): string | undefined {
  let output = "";
  for (const event of events.slice(-64)) {
    if (event.type !== "executor.output_delta") continue;
    output += event.textDelta.slice(0, Math.max(0, 2_000 - output.length));
    if (output.length >= 2_000) break;
  }
  return output || undefined;
}

function resolveTarget(input: ProtocolToolInput, details: {
  result: { ok: boolean; error?: { code?: string; message?: string } };
  trace?: { events?: ProvenanceEventV1[]; executionEvents?: ExecutionEventV1[] };
}): string | undefined {
  if (input.target?.includes(".")) return input.target;
  const result = details.result as { ok?: unknown; nodeId?: unknown; provide?: unknown };
  if (result.ok === true && typeof result.nodeId === "string" && typeof result.provide === "string") return `${result.nodeId}.${result.provide}`;
  return details.trace?.events?.at(-1)?.target;
}

function outputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (isTextObject(output)) return output.text;
  if (output && typeof output === "object" && typeof (output as { text?: unknown }).text === "string") return (output as { text: string }).text;
  try { return JSON.stringify(output, null, 2); } catch { return "[unrenderable output]"; }
}

function prepare(input: ProtocolToolInput | undefined): ProtocolToolInput {
  if (!input) return { op: "list" };
  try { return normalizeProtocolToolInput(input); } catch { return { op: "list" }; }
}

function boundText(text: string, maxChars: number, maxLines: number): { text: string; truncated: boolean } {
  let end = Math.min(text.length, maxChars);
  let lines = 1;
  for (let index = 0; index < end; index++) {
    if (text[index] === "\n" && ++lines > maxLines) { end = index; break; }
  }
  const truncated = end < text.length;
  return { text: `${text.slice(0, end).trimEnd()}${truncated ? "\n… [truncated]" : ""}`, truncated };
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
