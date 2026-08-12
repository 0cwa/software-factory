export type WorkflowPhaseKind = "request" | "capability" | "adapter" | "gate" | "terminal";
export type TerminalOutcome = "accepted" | "rejected";
export type GuardCondition = "always" | "execution_succeeded" | "acceptance_passed" | "acceptance_failed";
export type LocalAdapterId = "scout_to_architect_request";

export interface FactoryPaths {
  readonly root: string;
  readonly workflows: string;
  readonly prompts: string;
}

export interface FactoryConfig {
  readonly paths: FactoryPaths;
}

export interface GuardDefinition {
  readonly id: string;
  readonly condition: GuardCondition;
}

export interface PhaseDefinition {
  readonly id: string;
  readonly kind: WorkflowPhaseKind;
  readonly label: string;
  readonly target?: string;
  readonly adapter?: LocalAdapterId;
  readonly promptAsset?: string;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly terminalOutcome?: TerminalOutcome;
}

export interface TransitionDefinition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly guard: string;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: number;
  readonly entryPhaseId: string;
  readonly maxTraversalSteps: number;
  readonly phases: readonly PhaseDefinition[];
  readonly transitions: readonly TransitionDefinition[];
  readonly guards: readonly GuardDefinition[];
}

export interface WorkUnit {
  readonly id: string;
  readonly requestId: string;
  readonly task: string;
  readonly status: "pending" | "running" | "completed" | "rejected";
}

export interface FactoryRun {
  readonly id: string;
  readonly workUnitId: string;
  readonly workflowId: string;
  readonly status: "pending" | "running" | "succeeded" | "rejected" | "failed";
  readonly currentPhaseId: string;
}

export interface CapabilityReceiptRef {
  readonly receiptId: string;
  readonly target: string;
  readonly digest?: string;
}

export interface ArtifactRef {
  readonly id: string;
  readonly kind: "file" | "report" | "prompt";
  readonly path: string;
  readonly digest?: string;
}

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly phaseId?: string;
  readonly severity: "info" | "warning" | "error";
}

export interface PhaseEnvelope<T = unknown> {
  readonly phaseId: string;
  readonly attemptId: string;
  readonly status: "succeeded" | "rejected" | "failed";
  readonly output?: T;
  readonly diagnostics: readonly Diagnostic[];
  readonly receipt?: CapabilityReceiptRef;
  readonly artifacts?: readonly ArtifactRef[];
}

export interface PhaseAttempt {
  readonly id: string;
  readonly runId: string;
  readonly phaseId: string;
  readonly attempt: number;
  readonly envelope?: PhaseEnvelope;
}

export interface GateReport {
  readonly gateId: string;
  readonly passed: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly checkedAt?: string;
}

export interface AcceptanceResult {
  readonly accepted: boolean;
  readonly gateReports: readonly GateReport[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface RunOutcome {
  readonly status: "accepted" | "rejected" | "failed";
  readonly acceptance: AcceptanceResult;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ScoutFile {
  readonly path: string;
  readonly line?: number;
  readonly relevance: string;
}

export interface ScoutCodePath {
  readonly from: string;
  readonly to: string;
  readonly relationship: string;
}

/** Local copy of the currently consumed public role shape; it is not imported from pi-dev. */
export interface ScoutOutput {
  readonly summary: string;
  readonly files: readonly ScoutFile[];
  readonly codePaths: readonly ScoutCodePath[];
  readonly findings: readonly string[];
  readonly unresolvedQuestions: readonly string[];
  readonly diagnostics: readonly string[];
  readonly message: string;
}

export interface ArchitectRequest {
  readonly task: string;
  readonly context?: string;
  readonly constraints?: readonly string[];
}

/** Local copy of the currently consumed public role shape; it is not imported from pi-dev. */
export interface ArchitectOutput {
  readonly summary: string;
  readonly assumptions: readonly string[];
  readonly plan: readonly { order: number; action: string; rationale: string }[];
  readonly risks: readonly { risk: string; mitigation: string }[];
  readonly acceptanceCriteria: readonly string[];
  readonly diagnostics: readonly string[];
  readonly message: string;
}
