import type { ProtocolDefinition, StandardEffect } from "./contract/types.ts";
import type { AuditDiagnostics, AuditPolicy, ProgressObserver } from "./provenance/sink.ts";
import type { CausalReceiptResult, InvocationReceiptSummary, InvokeTrackedResult } from "./provenance/receipt.ts";
import type { CanonicalProvenanceEventV1, ExecutionEventV1 } from "./provenance/events.ts";

export type JsonSchemaLite = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  required?: string[];
  properties?: Record<string, JsonSchemaLite>;
  additionalProperties?: boolean;
  items?: JsonSchemaLite;
  enum?: unknown[];
  description?: string;
};

export type ExecutionSpec =
  | { type: "handler"; handler: string }
  | { type: "agent"; agent: string };

export type ProtocolHandler = (
  input: unknown,
  context?: ProtocolInvocationContext,
) => unknown | Promise<unknown>;

export type InvocationSessionMode = "ephemeral" | "continue" | "end";

export interface InvocationSessionControl {
  id?: string;
  mode?: InvocationSessionMode;
}

export type ProtocolExecutionEventEmitter = (event: ExecutionEventV1) => void | Promise<void>;
export type ProtocolExecutionObserver = ProtocolExecutionEventEmitter;

export type StandardProtocolEffect = StandardEffect;

export interface ProtocolPrincipal {
  readonly id: string;
  readonly kind: "host" | "user" | "agent" | "system";
}

export interface ProtocolGrant {
  readonly targets: readonly string[];
  readonly effects?: readonly StandardProtocolEffect[];
  readonly maxDepth?: number;
  readonly maxInvocations?: number;
}

export interface InvocationBudget {
  readonly maxDepth: number;
  readonly remainingDepth: number;
  readonly remainingInvocations: number;
}

export interface ChildInvokeOptions {
  readonly deadline?: number;
  readonly grant?: ProtocolGrant;
  readonly signal?: AbortSignal;
}

export interface ProtocolInvocationContext {
  nodeId: string;
  provide: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  callerNodeId?: string;
  session?: InvocationSessionControl;
  abortSignal?: AbortSignal;
  emitExecutionEvent?: ProtocolExecutionEventEmitter;
  invocationId?: string;
  contractDigest?: string;
  signal?: AbortSignal;
  deadline?: number;
  principal?: ProtocolPrincipal;
  remainingBudget?: InvocationBudget;
  invoke?: (target: string, input: unknown, options?: ChildInvokeOptions) => Promise<InvokeTrackedResult>;
  progress?: (event: { message?: string; completed?: number; total?: number }) => void;
}

export type ProtocolAgentExecutor = (
  input: unknown,
  context?: ProtocolInvocationContext,
) => unknown | Promise<unknown>;

// A node is the top-level thing we discover first.
// Example: "scheduling" or "records".
export interface ProtocolNode {
  nodeId: string;
  purpose: string;
  provides: ProvideSpec[];
  tags?: string[];
}

// A provide is one callable/discoverable capability inside a node.
// Schemas define the contract; execution defines what implements it.
export interface ProvidePolicySpec {
  confirmation?: "free" | "required";
}

export interface ProvideSpec {
  name: string;
  description: string;
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  execution: ExecutionSpec;
  version?: string;
  tags?: string[];
  effects?: string[];
  policy?: ProvidePolicySpec;
}

export interface ProtocolBindings {
  handlers?: Record<string, ProtocolHandler>;
  agents?: Record<string, ProtocolAgentExecutor>;
  dispose?: () => void | Promise<void>;
}

export interface ProtocolRegistrationMetadata {
  packageId?: string;
  packageVersion?: string;
  sourcePath?: string;
  buildId?: string;
}

export interface ProtocolRegistration {
  readonly registrationId: string;
  readonly nodeId: string;
  readonly generation: number;
  readonly contractDigest: string;
  replace(definition: ProtocolDefinition, bindings: ProtocolBindings): Promise<void>;
  dispose(): Promise<void>;
}

// A provide snapshot is what discovery returns when a provide is viewed
// outside its node. It adds ownership information.
export interface ProvideSnapshot extends ProvideSpec {
  nodeId: string;
  globalId: string;
}

export interface RegistrySnapshot {
  nodes: ProtocolNode[];
  provides: ProvideSnapshot[];
}

export interface ProtocolSearchOptions {
  readonly limit?: number;
  readonly tags?: readonly string[];
  readonly effects?: readonly string[];
}

export interface ProtocolSearchResult {
  readonly totalMatches: number;
  readonly provides: readonly ProvideSnapshot[];
}

export interface ProtocolFabricDiagnostics {
  readonly registrations: readonly {
    readonly nodeId: string;
    readonly registrationId: string;
    readonly generation: number;
    readonly contractDigest: string;
    readonly packageId?: string;
    readonly packageVersion?: string;
    readonly sourcePath?: string;
    readonly buildId?: string;
    readonly inFlight: number;
    readonly draining: boolean;
  }[];
  readonly admission: { readonly active: number; readonly queued: number };
}

export interface InvokeRequest {
  nodeId: string;
  provide: string;
  input: unknown;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  callerNodeId?: string;
  session?: InvocationSessionControl;
  abortSignal?: AbortSignal;
}

export type InvokeErrorCode =
  | "INVALID_TARGET" | "NOT_FOUND" | "CONTRACT_CHANGED" | "INPUT_INVALID" | "OUTPUT_INVALID"
  | "FORBIDDEN" | "CONFIRMATION_REQUIRED" | "CONFIRMATION_DENIED" | "DEADLINE_EXCEEDED"
  | "CANCELLED" | "OUTCOME_UNKNOWN" | "OVERLOADED" | "CONFLICT" | "SESSION_NOT_FOUND"
  | "AUDIT_UNAVAILABLE" | "EXECUTION_FAILED";

export type InvokeResult =
  | { ok: true; nodeId: string; provide: string; output: unknown }
  | { ok: false; error: { code: InvokeErrorCode; message: string } };

export type RecorderUnsubscribe = () => void;

export interface ConfirmationRequest {
  readonly principal: ProtocolPrincipal;
  readonly target: string;
  readonly contractDigest?: string;
  readonly inputDigest: string;
  readonly effects: readonly StandardProtocolEffect[];
  readonly expiresAt: number;
}

export interface ConfirmationBroker {
  confirm(request: ConfirmationRequest): boolean | Promise<boolean>;
}

export interface InvokeAsOptions {
  readonly grant: ProtocolGrant;
  readonly deadline?: number;
  readonly signal?: AbortSignal;
}

export interface CreateProtocolFabricOptions {
  audit?: AuditPolicy;
  confirmationBroker?: ConfirmationBroker;
  confirmationRequiredEffects?: readonly StandardProtocolEffect[];
  maxConcurrentInvocations?: number;
  maxQueuedInvocations?: number;
  defaultDeadlineMs?: number;
}

export interface ProtocolFabric {
  subscribeAudit(observer: (event: CanonicalProvenanceEventV1) => void | Promise<void>): RecorderUnsubscribe;
  subscribeProgress(observer: ProgressObserver): RecorderUnsubscribe;
  subscribeExecution(observer: ProtocolExecutionObserver): RecorderUnsubscribe;
  auditDiagnostics(): AuditDiagnostics;
  diagnostics(): ProtocolFabricDiagnostics;
  getReceipt(invocationId: string, authority: object): InvocationReceiptSummary | undefined;
  lookupCausalProvenance(invocationId: string, authority: object, options?: { maxDepth?: number; limit?: number }): CausalReceiptResult | undefined;
  invokeTracked(request: InvokeRequest): Promise<InvokeTrackedResult>;
  mintPrincipal(id: string, kind?: ProtocolPrincipal["kind"]): ProtocolPrincipal;
  invokeAs(principal: ProtocolPrincipal, target: string, input: unknown, options: InvokeAsOptions): Promise<InvokeTrackedResult>;
  install(definition: ProtocolDefinition, bindings: ProtocolBindings, metadata?: ProtocolRegistrationMetadata): ProtocolRegistration;
  registry(): RegistrySnapshot;
  search(query: string, options?: ProtocolSearchOptions): ProtocolSearchResult;
  describeNode(nodeId: string): ProtocolNode | undefined;
  describeProvide(nodeId: string, provideName: string): ProvideSnapshot | undefined;
}
