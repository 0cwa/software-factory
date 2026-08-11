import type { CanonicalProvenanceEventV1, ProgressEventV1 } from "./events.ts";
import type { InvocationReceiptSummary } from "./receipt.ts";

export interface AuditSink {
  append(event: CanonicalProvenanceEventV1): void | Promise<void>;
}

export interface ProgressObserver {
  emit(event: ProgressEventV1): void;
}

export interface AuditPolicy {
  mode?: "best_effort" | "required";
  sink?: AuditSink;
  timeoutMs?: number;
  maxEvents?: number;
  maxReceipts?: number;
  maxBytes?: number;
  authorizeReceipt?: (authority: object, receipt: InvocationReceiptSummary) => boolean;
}

export interface AuditDiagnostics {
  readonly eventCount: number;
  readonly receiptCount: number;
  readonly retainedBytes: number;
  readonly evictedEvents: number;
  readonly evictedReceipts: number;
  readonly sinkQueued: number;
  readonly sinkDropped: number;
  readonly sinkFailures: number;
  readonly outcomeUnknown: number;
  readonly observerDropped: number;
  readonly observerFailures: number;
}
