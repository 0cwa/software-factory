import { AsyncLocalStorage } from "node:async_hooks";
import type { InvokeResult, RecorderUnsubscribe } from "../types.ts";
import type { CanonicalProvenanceEventV1, ProgressEventV1, ProvenanceEventV1, RegistrationProvenanceEventV1 } from "./events.ts";
import type { CausalReceiptResult, InvocationReceiptState, InvocationReceiptSummary, InvokeTrackedResult } from "./receipt.ts";
import type { AuditDiagnostics, AuditPolicy, ProgressObserver } from "./sink.ts";

const MAX_EVENT_BYTES = 16_384;
const MAX_SINK_EVENTS = 1_024;
const MAX_SINK_BYTES = 2_097_152;
const receiptContext = new AsyncLocalStorage<string>();

type ExternalAudit = InvocationReceiptSummary["externalAudit"];
interface MutableReceipt {
  schemaVersion: 1;
  invocationId: string;
  revision: number;
  state: InvocationReceiptState;
  traceId: string;
  spanId: string;
  parentInvocationId?: string;
  target: string;
  registrationId?: string;
  generation?: number;
  contractDigest?: string;
  requestedAt: number;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  outcomeCode?: string;
  effectsMayHaveOccurred: boolean;
  childInvocationIds: string[];
  externalAudit: ExternalAudit;
}

export class AuditLedger {
  readonly policy: Required<Pick<AuditPolicy, "mode" | "timeoutMs" | "maxEvents" | "maxReceipts" | "maxBytes">> & AuditPolicy;
  private sequence = 0;
  private retainedBytes = 0;
  private events: Array<{ event: CanonicalProvenanceEventV1; bytes: number }> = [];
  private receipts = new Map<string, MutableReceipt>();
  private receiptOrder: string[] = [];
  private subscribers = new Set<(event: CanonicalProvenanceEventV1) => void | Promise<void>>();
  private subscriberQueues = new Map<(event: CanonicalProvenanceEventV1) => void | Promise<void>, CanonicalProvenanceEventV1[]>();
  private subscriberActive = new Set<(event: CanonicalProvenanceEventV1) => void | Promise<void>>();
  private progressObservers = new Set<ProgressObserver>();
  private progressQueues = new Map<ProgressObserver, ProgressEventV1[]>();
  private lookupRates = new WeakMap<object, { windowStarted: number; count: number }>();
  private sinkQueue: Array<{ event: CanonicalProvenanceEventV1; bytes: number }> = [];
  private sinkQueueBytes = 0;
  private sinkDraining = false;
  private requiredStartsInFlight = 0;
  private counters = { evictedEvents: 0, evictedReceipts: 0, sinkDropped: 0, sinkFailures: 0, outcomeUnknown: 0, observerDropped: 0, observerFailures: 0 };

  constructor(policy: AuditPolicy = {}) {
    this.policy = {
      ...policy,
      mode: policy.mode ?? "best_effort",
      timeoutMs: Math.min(Math.max(policy.timeoutMs ?? 250, 1), 5_000),
      maxEvents: Math.min(Math.max(policy.maxEvents ?? 4_096, 64), 8_192),
      maxReceipts: Math.min(Math.max(policy.maxReceipts ?? 2_048, 64), 4_096),
      maxBytes: Math.min(Math.max(policy.maxBytes ?? 8_388_608, 262_144), 16_777_216),
    };
  }

  createReceipt(input: { traceId: string; spanId: string; target: string }): MutableReceipt {
    const invocationId = `invocation_${crypto.randomUUID()}`;
    const parentInvocationId = receiptContext.getStore();
    const receipt: MutableReceipt = {
      schemaVersion: 1,
      invocationId,
      revision: 1,
      state: "requested",
      traceId: input.traceId,
      spanId: input.spanId,
      ...(parentInvocationId ? { parentInvocationId } : {}),
      target: input.target,
      requestedAt: Date.now(),
      effectsMayHaveOccurred: false,
      childInvocationIds: [],
      externalAudit: this.policy.sink ? (this.policy.mode === "required" ? "pending" : "queued") : "not_configured",
    };
    this.receipts.set(invocationId, receipt);
    this.receiptOrder.push(invocationId);
    if (parentInvocationId) {
      const parent = this.receipts.get(parentInvocationId);
      if (parent && parent.childInvocationIds.length < 100) parent.childInvocationIds.push(invocationId);
    }
    this.evictReceipts();
    this.append(this.event(receipt, "invocation.requested"));
    return receipt;
  }

  bind(receipt: MutableReceipt, registration: { registrationId?: string; generation?: number; contractDigest?: string }): void {
    if (registration.registrationId !== undefined) receipt.registrationId = registration.registrationId;
    if (registration.generation !== undefined) receipt.generation = registration.generation;
    if (registration.contractDigest !== undefined) receipt.contractDigest = registration.contractDigest;
    receipt.revision += 1;
  }

  async start(receipt: MutableReceipt, inputBytes: number): Promise<boolean> {
    receipt.state = "started";
    receipt.startedAt = Date.now();
    receipt.revision += 1;
    const event = this.event(receipt, "invocation.started", { inputBytes, effectsMayHaveOccurred: false });
    this.append(event);
    if (!this.policy.sink || this.policy.mode !== "required") return true;
    if (this.requiredStartsInFlight >= 64) {
      receipt.externalAudit = "failed";
      this.counters.sinkFailures += 1;
      return false;
    }
    this.requiredStartsInFlight += 1;
    let append: Promise<void>;
    try { append = Promise.resolve(this.policy.sink.append(event)); }
    catch { append = Promise.reject(new Error("audit append failed")); }
    void append.then(
      () => { this.requiredStartsInFlight = Math.max(0, this.requiredStartsInFlight - 1); },
      () => { this.requiredStartsInFlight = Math.max(0, this.requiredStartsInFlight - 1); },
    );
    try {
      await withTimeout(append, this.policy.timeoutMs);
      receipt.externalAudit = "accepted";
      receipt.revision += 1;
      return true;
    } catch {
      receipt.externalAudit = "failed";
      receipt.revision += 1;
      this.counters.sinkFailures += 1;
      return false;
    }
  }

  dispatched(receipt: MutableReceipt): void {
    receipt.effectsMayHaveOccurred = true;
    receipt.revision += 1;
  }

  reject(receipt: MutableReceipt, code: string): void {
    if (this.policy.sink && this.policy.mode === "required" && receipt.externalAudit === "pending") receipt.externalAudit = "queued";
    receipt.state = "rejected";
    receipt.outcomeCode = code;
    receipt.endedAt = Date.now();
    receipt.revision += 1;
    const event = this.event(receipt, "invocation.rejected", { outcomeCode: code, effectsMayHaveOccurred: false });
    this.append(event);
    if (this.policy.sink && this.policy.mode === "required") this.enqueueSink(event, jsonBytes(event));
    this.evictReceipts();
  }

  approval(receipt: MutableReceipt, state: "requested" | "approved" | "denied"): void {
    const type = state === "requested" ? "invocation.approval_requested" : state === "approved" ? "invocation.approved" : "invocation.denied";
    this.append(this.event(receipt, type, { effectsMayHaveOccurred: false }));
  }

  cancelRequested(receipt: MutableReceipt): void {
    this.append(this.event(receipt, "invocation.cancel_requested", { effectsMayHaveOccurred: receipt.effectsMayHaveOccurred }));
  }

  outcomeUnknown(receipt: MutableReceipt): void {
    if (isTerminal(receipt.state)) return;
    receipt.state = "outcome_unknown";
    receipt.revision += 1;
    this.counters.outcomeUnknown += 1;
    this.append(this.event(receipt, "invocation.outcome_unknown", { outcomeCode: "OUTCOME_UNKNOWN", effectsMayHaveOccurred: true }));
  }

  settle(receipt: MutableReceipt, result: InvokeResult): void {
    const endedAt = Date.now();
    receipt.endedAt = endedAt;
    receipt.durationMs = receipt.startedAt === undefined ? 0 : Math.max(0, endedAt - receipt.startedAt);
    if (result.ok) {
      receipt.state = "succeeded";
      receipt.outcomeCode = "OK";
    } else if (result.error.code === "CANCELLED") {
      receipt.state = "cancelled";
      receipt.outcomeCode = "CANCELLED";
    } else {
      receipt.state = "failed";
      receipt.outcomeCode = result.error.code;
    }
    receipt.revision += 1;
    const type = receipt.state === "succeeded" ? "invocation.succeeded" : receipt.state === "cancelled" ? "invocation.cancelled" : "invocation.failed";
    const event = this.event(receipt, type, {
      durationMs: receipt.durationMs,
      outcomeCode: receipt.outcomeCode,
      outputBytes: result.ok ? jsonBytes(result.output) : undefined,
      effectsMayHaveOccurred: receipt.effectsMayHaveOccurred,
    });
    this.append(event);
    if (this.policy.sink && this.policy.mode === "required") this.enqueueSink(event, jsonBytes(event));
    this.evictReceipts();
  }

  runWithReceipt<T>(receiptId: string, callback: () => T): T {
    return receiptContext.run(receiptId, callback);
  }

  snapshot(receipt: MutableReceipt): InvocationReceiptSummary {
    return deepFreeze(omitUndefined({ ...receipt, childInvocationIds: [...receipt.childInvocationIds] })) as InvocationReceiptSummary;
  }

  trackedResult(result: InvokeResult, receipt: MutableReceipt): InvokeTrackedResult {
    const summary = this.snapshot(receipt);
    return result.ok
      ? { ok: true, output: result.output, result, receipt: summary }
      : { ok: false, error: result.error, result, receipt: summary };
  }

  getReceipt(invocationId: string, authority: object): InvocationReceiptSummary | undefined {
    const receipt = this.receipts.get(invocationId);
    if (!this.allowLookup(authority) || !receipt) return undefined;
    return this.authorizedSnapshot(receipt, authority);
  }

  causal(invocationId: string, authority: object, options: { maxDepth?: number; limit?: number } = {}): CausalReceiptResult | undefined {
    const root = this.receipts.get(invocationId);
    if (!this.allowLookup(authority) || !root || !this.authorizedSnapshot(root, authority)) return undefined;
    const maxDepth = Math.min(Math.max(options.maxDepth ?? 4, 0), 8);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const output: InvocationReceiptSummary[] = [];
    const queue = [{ id: invocationId, depth: 0 }];
    let truncated = false;
    while (queue.length && output.length < limit) {
      const next = queue.shift()!;
      const receipt = this.receipts.get(next.id);
      const authorized = receipt ? this.authorizedSnapshot(receipt, authority) : undefined;
      if (!receipt || !authorized) continue;
      output.push(authorized);
      if (next.depth < maxDepth) for (const child of receipt.childInvocationIds) queue.push({ id: child, depth: next.depth + 1 });
      else if (receipt.childInvocationIds.length) truncated = true;
    }
    if (queue.length) truncated = true;
    return deepFreeze({ root: this.authorizedSnapshot(root, authority)!, receipts: output, truncated });
  }

  registration(event: {
    type: RegistrationProvenanceEventV1["type"];
    occurredAt: number;
    registrationId: string;
    nodeId: string;
    generation?: number;
    contractDigest?: string;
    previousContractDigest?: string;
    packageId?: string;
    packageVersion?: string;
    outcomeCode?: string;
  }): void {
    this.append(deepFreeze(omitUndefined({ schemaVersion: 1, eventId: `event_${crypto.randomUUID()}`, sequence: ++this.sequence, ...event })) as RegistrationProvenanceEventV1);
  }

  subscribe(observer: (event: CanonicalProvenanceEventV1) => void | Promise<void>): RecorderUnsubscribe {
    this.subscribers.add(observer);
    this.subscriberQueues.set(observer, []);
    return () => { this.subscribers.delete(observer); this.subscriberQueues.delete(observer); };
  }

  subscribeProgress(observer: ProgressObserver): RecorderUnsubscribe {
    this.progressObservers.add(observer);
    return () => { this.progressObservers.delete(observer); this.progressQueues.delete(observer); };
  }

  progress(event: ProgressEventV1): void {
    const bounded = deepFreeze(omitUndefined({ ...event, ...(event.message !== undefined ? { message: event.message.slice(0, 1_024) } : {}) })) as ProgressEventV1;
    for (const observer of this.progressObservers) {
      const queue = this.progressQueues.get(observer) ?? [];
      if (!this.progressQueues.has(observer)) this.progressQueues.set(observer, queue);
      if (queue.length >= 128) { this.counters.observerDropped += 1; continue; }
      queue.push(bounded);
      if (queue.length === 1) queueMicrotask(() => this.drainProgress(observer));
    }
  }

  diagnostics(): AuditDiagnostics {
    return deepFreeze({
      eventCount: this.events.length,
      receiptCount: this.receipts.size,
      retainedBytes: this.retainedBytes,
      evictedEvents: this.counters.evictedEvents,
      evictedReceipts: this.counters.evictedReceipts,
      sinkQueued: this.sinkQueue.length,
      sinkDropped: this.counters.sinkDropped,
      sinkFailures: this.counters.sinkFailures,
      outcomeUnknown: this.counters.outcomeUnknown,
      observerDropped: this.counters.observerDropped,
      observerFailures: this.counters.observerFailures,
    });
  }

  private authorizedSnapshot(receipt: MutableReceipt, authority: object): InvocationReceiptSummary | undefined {
    const base = this.snapshot(receipt);
    if (!this.policy.authorizeReceipt?.(authority, base)) return undefined;
    const childInvocationIds = receipt.childInvocationIds.filter((id) => {
      const child = this.receipts.get(id);
      return child ? Boolean(this.policy.authorizeReceipt?.(authority, this.snapshot(child))) : false;
    });
    return deepFreeze({ ...base, childInvocationIds });
  }

  private allowLookup(authority: object): boolean {
    const now = Date.now();
    const rate = this.lookupRates.get(authority);
    if (!rate || now - rate.windowStarted >= 1_000) {
      this.lookupRates.set(authority, { windowStarted: now, count: 1 });
      return true;
    }
    rate.count += 1;
    return rate.count <= 10;
  }

  private event(receipt: MutableReceipt, type: ProvenanceEventV1["type"], extra: Partial<ProvenanceEventV1> = {}): ProvenanceEventV1 {
    return deepFreeze(omitUndefined({
      schemaVersion: 1,
      eventId: `event_${crypto.randomUUID()}`,
      sequence: ++this.sequence,
      type,
      occurredAt: Date.now(),
      invocationId: receipt.invocationId,
      traceId: receipt.traceId,
      spanId: receipt.spanId,
      parentInvocationId: receipt.parentInvocationId,
      target: receipt.target,
      registrationId: receipt.registrationId,
      generation: receipt.generation,
      contractDigest: receipt.contractDigest,
      externalAudit: receipt.externalAudit,
      ...extra,
    })) as ProvenanceEventV1;
  }

  private append(event: CanonicalProvenanceEventV1): void {
    const bytes = jsonBytes(event);
    if (bytes > MAX_EVENT_BYTES) return;
    this.events.push({ event, bytes });
    this.retainedBytes += bytes;
    while (this.events.length > this.policy.maxEvents || this.retainedBytes > this.policy.maxBytes) {
      const removed = this.events.shift();
      if (!removed) break;
      this.retainedBytes -= removed.bytes;
      this.counters.evictedEvents += 1;
    }
    for (const subscriber of this.subscribers) {
      const queue = this.subscriberQueues.get(subscriber)!;
      if (queue.length >= 128) { this.counters.observerDropped += 1; continue; }
      queue.push(event);
      if (!this.subscriberActive.has(subscriber)) {
        this.subscriberActive.add(subscriber);
        queueMicrotask(() => void this.drainSubscriber(subscriber));
      }
    }
    if (this.policy.sink && this.policy.mode === "best_effort") this.enqueueSink(event, bytes);
  }

  private async drainSubscriber(subscriber: (event: CanonicalProvenanceEventV1) => void | Promise<void>): Promise<void> {
    const queue = this.subscriberQueues.get(subscriber);
    if (!queue) { this.subscriberActive.delete(subscriber); return; }
    while (queue.length && this.subscribers.has(subscriber)) {
      try { await subscriber(queue.shift()!); }
      catch { this.counters.observerFailures += 1; }
    }
    this.subscriberActive.delete(subscriber);
  }

  private enqueueSink(event: CanonicalProvenanceEventV1, bytes: number): void {
    if (this.sinkQueue.length >= MAX_SINK_EVENTS || this.sinkQueueBytes + bytes > MAX_SINK_BYTES) {
      this.counters.sinkDropped += 1;
      return;
    }
    this.sinkQueue.push({ event, bytes });
    this.sinkQueueBytes += bytes;
    if (!this.sinkDraining) {
      this.sinkDraining = true;
      queueMicrotask(() => void this.drainSink());
    }
  }

  private async drainSink(): Promise<void> {
    while (this.sinkQueue.length) {
      const item = this.sinkQueue.shift()!;
      this.sinkQueueBytes -= item.bytes;
      try { await this.policy.sink!.append(item.event); }
      catch { this.counters.sinkFailures += 1; }
    }
    this.sinkDraining = false;
  }

  private drainProgress(observer: ProgressObserver): void {
    const queue = this.progressQueues.get(observer);
    if (!queue || !this.progressObservers.has(observer)) return;
    while (queue.length) {
      try { observer.emit(queue.shift()!); } catch { queue.length = 0; }
    }
  }

  private evictReceipts(): void {
    let inspected = 0;
    while (this.receiptOrder.length > this.policy.maxReceipts && inspected < this.receiptOrder.length) {
      const id = this.receiptOrder.shift()!;
      const receipt = this.receipts.get(id);
      if (receipt && isTerminal(receipt.state)) {
        this.receipts.delete(id);
        this.counters.evictedReceipts += 1;
      } else {
        this.receiptOrder.push(id);
        inspected += 1;
      }
    }
  }
}

export function jsonBytes(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
  catch { return MAX_EVENT_BYTES + 1; }
}

function isTerminal(state: InvocationReceiptState): boolean {
  return state === "rejected" || state === "succeeded" || state === "failed" || state === "cancelled";
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("audit timeout")), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
