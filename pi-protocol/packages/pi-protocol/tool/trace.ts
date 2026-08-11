import { createChildInvokeRequest, getCurrentProtocolInvocationContext } from "../context.ts";
import type { InvokeRequest, ProtocolFabric } from "../types.ts";
import type { ExecutionEventV1, ProvenanceEventV1 } from "../provenance/events.ts";
import type { InvocationReceiptSummary } from "../provenance/receipt.ts";
import type { CanonicalProvenanceEventV1 } from "../provenance/events.ts";
import { createProtocolToolId } from "./helpers.ts";
import type { ProtocolToolExecutionResult, ProtocolToolUpdateCallback } from "./types.ts";

export interface ProtocolTraceDetails {
  events: ProvenanceEventV1[];
  /** Present only in transient partial updates; final details retain executor identity but omit streamed text. */
  executionEvents?: ExecutionEventV1[];
}

export interface ProtocolCausalDetails {
  readonly invocations: readonly {
    readonly invocationId: string;
    readonly parentInvocationId?: string;
    readonly target: string;
    readonly state: string;
    readonly outcomeCode?: string;
    readonly effectsMayHaveOccurred: boolean;
  }[];
  readonly truncated: boolean;
}

export interface ProtocolInvokeToolDetails {
  ok: true;
  schemaVersion: 1;
  op: "call";
  state: "running" | "completed" | "failed" | "aborted" | "outcome_unknown";
  toolCallId?: string;
  result: unknown;
  receipt?: InvocationReceiptSummary;
  causal?: ProtocolCausalDetails;
  presentation?: { contentType: "text/markdown" };
  trace?: ProtocolTraceDetails;
}

export async function invokeWithTraceUpdates(
  fabric: ProtocolFabric,
  request: InvokeRequest,
  onUpdate: ProtocolToolUpdateCallback | undefined,
  signal?: AbortSignal,
  toolCallId?: string,
): Promise<ProtocolInvokeToolDetails> {
  const nested = Boolean(getCurrentProtocolInvocationContext());
  const contextualRequest = createChildInvokeRequest(request);
  const tracedRequest: InvokeRequest = {
    ...contextualRequest,
    traceId: nested ? contextualRequest.traceId : createProtocolToolId("trace"),
    spanId: nested ? contextualRequest.spanId : createProtocolToolId("span"),
    abortSignal: contextualRequest.abortSignal ?? signal,
  };
  const traceId = tracedRequest.traceId;
  const outputSchema = fabric.describeProvide(request.nodeId, request.provide)?.outputSchema as { contentMediaType?: string } | undefined;
  const contentType = outputSchema?.contentMediaType === "text/markdown" ? "text/markdown" : undefined;
  const executionEvents: ExecutionEventV1[] = [];
  const canonicalEvents: ProvenanceEventV1[] = [];
  let canonicalTruncated = false;
  let executionChars = 0;
  let lastUpdateAt = 0;
  const flush = () => safeUpdate(onUpdate, {
    content: [{ type: "text", text: "protocol running..." }],
    details: {
      ok: true,
      schemaVersion: 1,
      op: "call",
      state: "running",
      ...(toolCallId ? { toolCallId } : {}),
      result: { ok: true },
      trace: { events: [], executionEvents: [...executionEvents] },
      ...(contentType ? { presentation: { contentType } } : {}),
    },
  });
  const unsubscribeAudit = fabric.subscribeAudit((event: CanonicalProvenanceEventV1) => {
    if (!("invocationId" in event)) return;
    if (canonicalEvents.length >= 512) { canonicalEvents.shift(); canonicalTruncated = true; }
    canonicalEvents.push(event);
  });
  const unsubscribeExecution = fabric.subscribeExecution((event) => {
    if (traceId && event.traceId !== traceId) return;
    const bounded = boundExecutionEvent(event, Math.max(0, 40_000 - executionChars));
    if (!bounded) return;
    executionChars += bounded.type === "executor.output_delta" ? bounded.textDelta.length : 0;
    executionEvents.push(bounded);
    if (executionEvents.length > 256) executionEvents.shift();
    if (bounded.type === "executor.session") return;
    const now = Date.now();
    if (now - lastUpdateAt < 1_000) return;
    lastUpdateAt = now;
    flush();
  });

  try {
    const tracked = await fabric.invokeTracked(tracedRequest);
    await Promise.resolve();
    const observed = projectObservedCausalChain(tracked.receipt.invocationId, canonicalEvents, canonicalTruncated);
    const result = tracked.result;
    return {
      ok: true,
      schemaVersion: 1,
      op: "call",
      state: result.ok ? "completed" : result.error.code === "OUTCOME_UNKNOWN" ? "outcome_unknown" : result.error.code === "CANCELLED" ? "aborted" : "failed",
      ...(toolCallId ? { toolCallId } : {}),
      result,
      receipt: tracked.receipt,
      causal: observed.causal,
      trace: {
        events: observed.events,
        executionEvents: executionEvents.filter((event) => event.type === "executor.session"),
      },
      ...(contentType ? { presentation: { contentType } } : {}),
    };
  } finally {
    unsubscribeAudit();
    unsubscribeExecution();
  }
}

function projectObservedCausalChain(
  rootInvocationId: string,
  events: readonly ProvenanceEventV1[],
  alreadyTruncated: boolean,
): { causal: ProtocolCausalDetails; events: ProvenanceEventV1[] } {
  const included = new Set([rootInvocationId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of events) {
      if (included.has(event.invocationId) || !event.parentInvocationId || !included.has(event.parentInvocationId)) continue;
      included.add(event.invocationId);
      changed = true;
    }
  }
  const selected = events.filter((event) => included.has(event.invocationId)).slice(-512);
  const grouped = new Map<string, ProvenanceEventV1[]>();
  for (const event of selected) {
    const list = grouped.get(event.invocationId) ?? [];
    list.push(event);
    grouped.set(event.invocationId, list);
  }
  const invocations = [...grouped.values()].slice(0, 100).map((list) => {
    const first = list[0]!;
    const last = list[list.length - 1]!;
    return {
      invocationId: first.invocationId,
      ...(first.parentInvocationId ? { parentInvocationId: first.parentInvocationId } : {}),
      target: first.target,
      state: last.type.replace(/^invocation\./, ""),
      ...(last.outcomeCode ? { outcomeCode: last.outcomeCode } : {}),
      effectsMayHaveOccurred: list.some((event) => event.effectsMayHaveOccurred === true),
    };
  });
  return {
    causal: Object.freeze({
      invocations: Object.freeze(invocations.map((invocation) => Object.freeze(invocation))),
      truncated: alreadyTruncated || grouped.size > invocations.length,
    }),
    events: selected,
  };
}

function safeUpdate(callback: ProtocolToolUpdateCallback | undefined, update: ProtocolToolExecutionResult): void {
  try { callback?.(update); } catch { /* Projection observers are non-authoritative. */ }
}

function boundExecutionEvent(event: ExecutionEventV1, remaining: number): ExecutionEventV1 | undefined {
  if (event.type === "executor.session") return {
    schemaVersion: 1,
    type: event.type,
    traceId: event.traceId,
    spanId: event.spanId,
    model: event.model.slice(0, 512),
    ...(event.thinkingLevel ? { thinkingLevel: event.thinkingLevel.slice(0, 40) } : {}),
  };
  if (remaining <= 0) return undefined;
  return {
    schemaVersion: 1,
    type: event.type,
    traceId: event.traceId,
    spanId: event.spanId,
    textDelta: event.textDelta.slice(0, remaining),
  };
}
