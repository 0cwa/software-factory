import { AsyncLocalStorage } from "node:async_hooks";
import type { InvokeRequest, ProtocolFabric } from "./types.ts";

export interface CurrentProtocolInvocationContext {
  nodeId: string;
  provide: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  callerNodeId?: string;
  session?: InvokeRequest["session"];
  abortSignal?: AbortSignal;
  registrationId?: string;
  registrationGeneration?: number;
  childCounter: number;
}

const invocationContextStorage = new AsyncLocalStorage<CurrentProtocolInvocationContext>();

export function getCurrentProtocolInvocationContext(): CurrentProtocolInvocationContext | undefined {
  return invocationContextStorage.getStore();
}

export function runWithProtocolInvocationContext<T>(
  request: InvokeRequest,
  provenance: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    callerNodeId?: string;
    registrationId?: string;
    registrationGeneration?: number;
  },
  callback: () => T,
): T {
  const parent = invocationContextStorage.getStore();
  const context: CurrentProtocolInvocationContext = {
    nodeId: request.nodeId,
    provide: request.provide,
    traceId: provenance.traceId,
    spanId: provenance.spanId,
    parentSpanId: provenance.parentSpanId,
    callerNodeId: provenance.callerNodeId,
    session: request.session,
    abortSignal: request.abortSignal ?? parent?.abortSignal,
    registrationId: provenance.registrationId,
    registrationGeneration: provenance.registrationGeneration,
    childCounter: 0,
  };
  return runWithProtocolInvocationContextValue(context, callback);
}

export function runWithProtocolInvocationContextValue<T>(
  context: CurrentProtocolInvocationContext,
  callback: () => T,
): T {
  return invocationContextStorage.run(context, callback);
}

export function createChildInvokeRequest(request: InvokeRequest): InvokeRequest {
  const current = getCurrentProtocolInvocationContext();
  if (!current) return request;

  const inheritsCurrentParent = request.parentSpanId === undefined;

  return {
    ...request,
    // If this call is implicitly attached as a child of the current protocol
    // span, keep it on the current trace even when an agent supplied an
    // arbitrary traceId. Otherwise the provenance tree is split across traces
    // while still carrying an inherited parentSpanId, so nested recursive calls
    // disappear from the parent trace display.
    traceId: inheritsCurrentParent ? current.traceId : request.traceId ?? current.traceId,
    parentSpanId: request.parentSpanId ?? current.spanId,
    spanId: request.spanId ?? createChildSpanId(current),
    // Canonical protocol caller ids should generally use nodeId.provideName.
    // Root/user-originated calls may keep existing identities like pi-chat or root_agent.
    callerNodeId: request.callerNodeId ?? `${current.nodeId}.${current.provide}`,
    session: request.session ?? createInheritedChildSession(current),
    abortSignal: request.abortSignal ?? current.abortSignal,
  };
}

export function invokeTrackedFromCurrentContext(fabric: ProtocolFabric, request: InvokeRequest): ReturnType<ProtocolFabric["invokeTracked"]> {
  return fabric.invokeTracked(createChildInvokeRequest(request));
}

function createChildSpanId(current: CurrentProtocolInvocationContext): string {
  current.childCounter += 1;
  return `${current.spanId}.${createSafeSpanPart(current.nodeId)}_${createSafeSpanPart(current.provide)}_${current.childCounter}`;
}

function createSafeSpanPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "child";
}

function createInheritedChildSession(current: CurrentProtocolInvocationContext): InvokeRequest["session"] | undefined {
  if (!current.session?.id) return undefined;
  if (current.session.mode === "continue" || current.session.mode === "end") {
    return { id: current.session.id, mode: current.session.mode };
  }
  return undefined;
}
