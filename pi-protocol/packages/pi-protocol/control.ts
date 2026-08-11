import { AsyncLocalStorage } from "node:async_hooks";
import type { InvokeTrackedResult } from "./provenance/receipt.ts";
import type {
  ChildInvokeOptions,
  InvocationBudget,
  ProtocolGrant,
  ProtocolInvocationContext,
  ProtocolPrincipal,
  StandardProtocolEffect,
} from "./types.ts";

const PRINCIPAL_MARK = Symbol.for("@kybernetria/pi-protocol.principal.v1");
const storage = new AsyncLocalStorage<InvocationControlState>();

export interface InvocationControlState {
  readonly principal: ProtocolPrincipal;
  readonly grant: ProtocolGrant;
  readonly depth: number;
  readonly deadline: number;
  readonly signal: AbortSignal;
  readonly rootBudget: { remainingInvocations: number };
  readonly scopeBudgets: readonly { remainingInvocations: number }[];
  readonly maxDepth: number;
  readonly suspendConcurrency?: () => Promise<() => Promise<void>>;
  readonly invocationId?: string;
  readonly callingTarget?: string;
  readonly contractDigest?: string;
  readonly invokeChild: (target: string, input: unknown, options?: ChildInvokeOptions) => Promise<InvokeTrackedResult>;
  readonly progress: (event: { message?: string; completed?: number; total?: number }) => void;
}

export function mintProtocolPrincipal(id: string, kind: ProtocolPrincipal["kind"] = "host"): ProtocolPrincipal {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(id)) throw new Error("Invalid protocol principal id");
  const principal = { id, kind } as ProtocolPrincipal & Record<PropertyKey, unknown>;
  Object.defineProperty(principal, PRINCIPAL_MARK, { value: true });
  return Object.freeze(principal);
}

export function isProtocolPrincipal(value: unknown): value is ProtocolPrincipal {
  return typeof value === "object" && value !== null
    && (value as Record<PropertyKey, unknown>)[PRINCIPAL_MARK] === true
    && Object.isFrozen(value);
}

export function getInvocationControl(): InvocationControlState | undefined {
  return storage.getStore();
}

export function runWithInvocationControl<T>(state: InvocationControlState, callback: () => T): T {
  return storage.run(state, callback);
}

export function targetAllowed(grant: ProtocolGrant, target: string): boolean {
  return grant.targets.some((pattern) => pattern === "*" || pattern === target || (pattern.endsWith(".*") && target.startsWith(pattern.slice(0, -1))));
}

export function effectsAllowed(grant: ProtocolGrant, effects: readonly string[]): boolean {
  if (!grant.effects) return true;
  const allowed = new Set(grant.effects);
  return effects.every((effect) => allowed.has(effect as StandardProtocolEffect));
}

export function createHandlerInvocationContext(
  nodeId: string,
  provide: string,
  trace: { traceId?: string; spanId?: string; parentSpanId?: string; callerNodeId?: string },
): ProtocolInvocationContext {
  const control = storage.getStore();
  if (!control) {
    return { nodeId, provide, ...trace };
  }
  const remainingBudget: InvocationBudget = Object.freeze({
    maxDepth: control.maxDepth,
    remainingDepth: Math.max(0, control.maxDepth - control.depth),
    remainingInvocations: Math.max(0, Math.min(...control.scopeBudgets.map((budget) => budget.remainingInvocations))),
  });
  return {
    nodeId,
    provide,
    ...trace,
    invocationId: control.invocationId,
    contractDigest: control.contractDigest,
    signal: control.signal,
    abortSignal: control.signal,
    deadline: control.deadline,
    principal: control.principal,
    remainingBudget,
    invoke: control.invokeChild,
    progress: control.progress,
  };
}

export function intersectGrant(parent: ProtocolGrant, requested: ProtocolGrant | undefined): ProtocolGrant {
  if (!requested) return parent;
  const targets = requested.targets.filter((target) => parent.targets.some((allowed) =>
    allowed === "*" || allowed === target || (allowed.endsWith(".*") && target.startsWith(allowed.slice(0, -1)))
  ));
  const effects = parent.effects
    ? (requested.effects ?? parent.effects).filter((effect) => parent.effects!.includes(effect))
    : requested.effects;
  return Object.freeze({
    targets: Object.freeze([...new Set(targets)]),
    ...(effects ? { effects: Object.freeze([...new Set(effects)]) } : {}),
    maxDepth: Math.min(parent.maxDepth ?? 8, requested.maxDepth ?? parent.maxDepth ?? 8),
    maxInvocations: Math.min(parent.maxInvocations ?? 64, requested.maxInvocations ?? parent.maxInvocations ?? 64),
  });
}
