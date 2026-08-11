import type { InvokeResult } from "../types.ts";

export type InvocationReceiptState =
  | "requested"
  | "rejected"
  | "started"
  | "outcome_unknown"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface InvocationReceiptSummary {
  readonly schemaVersion: 1;
  readonly invocationId: string;
  readonly revision: number;
  readonly state: InvocationReceiptState;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentInvocationId?: string;
  readonly target: string;
  readonly registrationId?: string;
  readonly generation?: number;
  readonly contractDigest?: string;
  readonly requestedAt: number;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly durationMs?: number;
  readonly outcomeCode?: string;
  readonly effectsMayHaveOccurred: boolean;
  readonly childInvocationIds: readonly string[];
  readonly externalAudit: "not_configured" | "pending" | "accepted" | "queued" | "failed" | "dropped";
}

export type InvokeTrackedResult =
  | { readonly ok: true; readonly output: unknown; readonly result: InvokeResult; readonly receipt: InvocationReceiptSummary }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string }; readonly result: InvokeResult; readonly receipt: InvocationReceiptSummary };

export interface CausalReceiptResult {
  readonly root: InvocationReceiptSummary;
  readonly receipts: readonly InvocationReceiptSummary[];
  readonly truncated: boolean;
}
