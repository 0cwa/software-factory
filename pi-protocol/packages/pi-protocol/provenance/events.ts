export const PROVENANCE_SCHEMA_VERSION = 1 as const;

export type CanonicalInvocationEventType =
  | "invocation.requested"
  | "invocation.rejected"
  | "invocation.started"
  | "invocation.approval_requested"
  | "invocation.approved"
  | "invocation.denied"
  | "invocation.cancel_requested"
  | "invocation.outcome_unknown"
  | "invocation.succeeded"
  | "invocation.failed"
  | "invocation.cancelled";

export interface ProvenanceEventV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly sequence: number;
  readonly type: CanonicalInvocationEventType;
  readonly occurredAt: number;
  readonly invocationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentInvocationId?: string;
  readonly target: string;
  readonly registrationId?: string;
  readonly generation?: number;
  readonly contractDigest?: string;
  readonly inputBytes?: number;
  readonly outputBytes?: number;
  readonly durationMs?: number;
  readonly outcomeCode?: string;
  readonly effectsMayHaveOccurred?: boolean;
  readonly externalAudit?: "not_configured" | "pending" | "accepted" | "queued" | "failed" | "dropped";
}

export interface RegistrationProvenanceEventV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly sequence: number;
  readonly type: "registration.requested" | "registration.installed" | "registration.replaced" | "registration.removed" | "registration.rejected";
  readonly occurredAt: number;
  readonly registrationId: string;
  readonly nodeId: string;
  readonly generation?: number;
  readonly contractDigest?: string;
  readonly previousContractDigest?: string;
  readonly packageId?: string;
  readonly packageVersion?: string;
  readonly outcomeCode?: string;
}

export type CanonicalProvenanceEventV1 = ProvenanceEventV1 | RegistrationProvenanceEventV1;

export interface ProgressEventV1 {
  readonly schemaVersion: 1;
  readonly invocationId: string;
  readonly sequence: number;
  readonly message?: string;
  readonly completed?: number;
  readonly total?: number;
}

/** Ephemeral executor telemetry. It is bounded, observer-only, and never added to the audit ledger. */
export type ExecutionEventV1 =
  | {
      readonly schemaVersion: 1;
      readonly type: "executor.session";
      readonly traceId: string;
      readonly spanId: string;
      readonly model: string;
      readonly thinkingLevel?: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly type: "executor.output_delta";
      readonly traceId: string;
      readonly spanId: string;
      readonly textDelta: string;
    };
