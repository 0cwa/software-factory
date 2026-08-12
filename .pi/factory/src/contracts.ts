export type WorkflowPhaseKind = "request" | "capability" | "adapter" | "gate" | "terminal";
export type TerminalOutcome = "accepted" | "rejected";
export type GuardCondition = "always" | "execution_succeeded" | "acceptance_passed" | "acceptance_failed";
export type LocalAdapterId = "scout_to_architect_request";
export type CapabilityTarget = "pi_dev.scout" | "pi_dev.architect";
export type CapabilityDispatchStatus = "succeeded" | "failed" | "outcome_unknown";

export interface FactoryPaths { readonly root: string; readonly workflows: string; readonly prompts: string; }
export interface FactoryConfig { readonly paths: FactoryPaths; }
export interface GuardDefinition { readonly id: string; readonly condition: GuardCondition; }
export interface PhaseDefinition {
  readonly id: string; readonly kind: WorkflowPhaseKind; readonly label: string; readonly target?: string;
  readonly adapter?: LocalAdapterId; readonly promptAsset?: string; readonly maxInputBytes: number;
  readonly maxOutputBytes: number; readonly terminalOutcome?: TerminalOutcome;
}
export interface TransitionDefinition { readonly id: string; readonly from: string; readonly to: string; readonly guard: string; }
export interface WorkflowDefinition {
  readonly id: string; readonly version: number; readonly entryPhaseId: string; readonly maxTraversalSteps: number;
  readonly phases: readonly PhaseDefinition[]; readonly transitions: readonly TransitionDefinition[]; readonly guards: readonly GuardDefinition[];
}
export interface WorkUnit { readonly id: string; readonly requestId: string; readonly task: string; readonly status: "pending" | "running" | "completed" | "rejected"; }
export interface RepositoryIdentity { readonly head: string; readonly statusDigest: string; readonly filesDigest: string; }
export interface EnvironmentIdentity { readonly nodeMajor: number; readonly platform: string; readonly arch: string; readonly ci: boolean; readonly digest: string; }
export interface FactoryRun {
  readonly id: string; readonly workUnitId: string; readonly workflowId: string;
  readonly status: "pending" | "running" | "awaiting_capability" | "awaiting_acceptance" | "succeeded" | "rejected" | "failed" | "abandoned";
  readonly currentPhaseId: string; readonly executionStatus?: "pending" | "running" | "succeeded" | "failed" | "outcome_unknown";
  readonly acceptanceStatus?: "pending" | "accepted" | "rejected"; readonly uncertainInvocation?: boolean; readonly taskDigest?: string;
  readonly workflowDigest?: string; readonly repositoryIdentity?: RepositoryIdentity; readonly environmentIdentity?: EnvironmentIdentity;
  readonly phaseEnvelopes?: Readonly<Record<string, PhaseEnvelope>>;
}

/** Bounded projection of Protocol's public InvocationReceiptSummary v1. */
export interface CapabilityReceiptRef {
  readonly schemaVersion: 1; readonly invocationId: string; readonly revision: number;
  readonly state: "requested" | "rejected" | "started" | "outcome_unknown" | "succeeded" | "failed" | "cancelled";
  readonly traceId: string; readonly spanId: string; readonly parentInvocationId?: string; readonly target: string;
  readonly registrationId?: string; readonly generation?: number; readonly contractDigest?: string;
  readonly requestedAt: number; readonly startedAt?: number; readonly endedAt?: number; readonly durationMs?: number;
  readonly outcomeCode?: string; readonly effectsMayHaveOccurred: boolean; readonly childInvocationIds: readonly string[];
  readonly externalAudit: "not_configured" | "pending" | "accepted" | "queued" | "failed" | "dropped";
  readonly projectionDigest: string;
}
export interface ArtifactRef { readonly id: string; readonly kind: "file" | "report" | "prompt"; readonly path: string; readonly digest?: string; readonly bytes?: number; }
export interface CapabilityInvocation {
  readonly runId: string; readonly phaseId: "scout" | "architect"; readonly target: CapabilityTarget; readonly input: unknown;
  readonly inputDigest: string; readonly workflowDigest: string; readonly prompt: ArtifactRef;
  readonly repositoryIdentityDigest: string; readonly environmentIdentityDigest: string; readonly signal?: AbortSignal; readonly deadline?: number;
}
export interface CapabilitySuccess { readonly status: "succeeded"; readonly output: unknown; readonly receipt: unknown; }
export interface CapabilityFailure { readonly status: "failed"; readonly diagnostics: readonly Diagnostic[]; readonly receipt?: unknown; }
export interface CapabilityOutcomeUnknown { readonly status: "outcome_unknown"; readonly diagnostics: readonly Diagnostic[]; readonly receipt?: unknown; }
export type CapabilityDispatchResult = CapabilitySuccess | CapabilityFailure | CapabilityOutcomeUnknown;
export interface CapabilityPort { dispatch(target: CapabilityTarget, invocation: CapabilityInvocation): Promise<CapabilityDispatchResult>; }
export interface GateCheck { readonly id: string; readonly passed: boolean; readonly explanation: string; }
export interface Diagnostic { readonly code: string; readonly message: string; readonly phaseId?: string; readonly severity: "info" | "warning" | "error"; }
export interface PhaseEnvelope<T = unknown> {
  readonly phaseId: string; readonly attemptId: string; readonly status: "succeeded" | "rejected" | "failed";
  readonly output?: T; readonly diagnostics: readonly Diagnostic[]; readonly receipt?: CapabilityReceiptRef; readonly artifacts?: readonly ArtifactRef[];
}
export interface PhaseAttempt { readonly id: string; readonly runId: string; readonly phaseId: string; readonly attempt: number; readonly envelope?: PhaseEnvelope; }
export interface GateReport { readonly gateId: string; readonly passed: boolean; readonly diagnostics: readonly Diagnostic[]; readonly checks?: readonly GateCheck[]; readonly checkedAt?: string; }
export interface AcceptanceResult { readonly accepted: boolean; readonly gateReports: readonly GateReport[]; readonly diagnostics: readonly Diagnostic[]; }
export interface RunOutcome { readonly status: "accepted" | "rejected" | "failed" | "outcome_unknown" | "awaiting_acceptance"; readonly acceptance: AcceptanceResult; readonly diagnostics: readonly Diagnostic[]; }

export interface ScoutFile { readonly path: string; readonly line?: number; readonly relevance: string; }
export interface ScoutCodePath { readonly from: string; readonly to: string; readonly relationship: string; }
export interface ScoutOutput { readonly summary: string; readonly files: readonly ScoutFile[]; readonly codePaths: readonly ScoutCodePath[]; readonly findings: readonly string[]; readonly unresolvedQuestions: readonly string[]; readonly diagnostics: readonly string[]; readonly message: string; }
export interface ArchitectRequest { readonly task: string; readonly context?: string; readonly constraints?: readonly string[]; }
export interface ArchitectPlanItem { readonly order: number; readonly action: string; readonly rationale: string; }
export interface ArchitectRisk { readonly risk: string; readonly mitigation: string; }
export interface ArchitectOutput { readonly summary: string; readonly assumptions: readonly string[]; readonly plan: readonly ArchitectPlanItem[]; readonly risks: readonly ArchitectRisk[]; readonly acceptanceCriteria: readonly string[]; readonly diagnostics: readonly string[]; readonly message: string; }
