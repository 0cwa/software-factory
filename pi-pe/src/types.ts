import type {
  ExecutionSpec,
  InvokeErrorCode,
  JsonSchemaLite as CoreJsonSchemaLite,
  ProtocolInvocationContext,
  ProvideSnapshot,
} from "@kybernetria/pi-protocol/core";
import type { ProtocolManifestV1 } from "@kybernetria/pi-protocol/contract";

export type PiProtocolManifest = ProtocolManifestV1;
export type { ProtocolInvocationContext, ProvideSnapshot };
export type JsonSchemaLite = Omit<CoreJsonSchemaLite, "properties" | "items"> & {
  properties?: Record<string, JsonSchemaLite>;
  additionalProperties?: boolean;
  items?: JsonSchemaLite;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Assurance = "static" | "runtime_only" | "invalid";
export type DependencyPolicy = "pinned" | "compatible";

export interface PipelineLimits {
  timeoutMs?: number;
  maxSteps?: number;
  maxIntermediateBytes?: number;
  maxNestedDepth?: number;
  maxInvocations?: number;
}

export type ValueSource =
  | { source: "pipeline_input"; pointer?: string }
  | { source: "previous"; pointer?: string }
  | { source: "step"; stepId: string; pointer?: string };

export interface Binding {
  to: string;
  from: ValueSource;
  required?: boolean;
}

export interface PipelineStepV1 {
  id: string;
  target: string;
  input:
    | { mode: "pass"; from: ValueSource }
    | {
        mode: "object";
        bindings: Binding[];
        constants?: Array<{ to: string; value: JsonValue }>;
      };
  timeoutMs?: number;
}

export interface DependencySnapshot {
  target: string;
  nodeId: string;
  provide: string;
  packageId?: string;
  nodeVersion?: string;
  provideVersion?: string;
  execution: ExecutionSpec;
  effects: string[];
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  fingerprint: string;
}

export interface PipelineReview {
  runtimeOnly: boolean;
  reviewedAt: string;
}

export interface PipelineSpecV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  tags: string[];
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  limits?: PipelineLimits;
  dependencyPolicy?: DependencyPolicy;
  steps: PipelineStepV1[];
  output?: ValueSource;
  createdAt: string;
  updatedAt: string;
  /** Materialized by save_pipeline and used for dependency pinning. */
  dependencies?: DependencySnapshot[];
  /** Materialized when a runtime-only pipeline receives explicit review. */
  review?: PipelineReview;
}

export type IssueSeverity = "error" | "warning";

export interface Issue {
  code: string;
  message: string;
  path?: string;
  stepId?: string;
  target?: string;
}

export interface ValidationReport {
  valid: boolean;
  assurance: Assurance;
  errors: Issue[];
  warnings: Issue[];
  dependencies: DependencySnapshot[];
  generatedTarget?: string;
}

export interface ResolvedTarget {
  provide: ProvideSnapshot;
  packageId?: string;
  nodeVersion?: string;
}

export type TargetResolver = (target: string) => ResolvedTarget | undefined;

export type PipelineEntryStatus = "enabled" | "disabled" | "quarantined";

export interface PipelineStatus {
  id: string;
  target: string;
  name?: string;
  version?: string;
  status: PipelineEntryStatus;
  assurance?: Assurance;
  registered: boolean;
  issues: Issue[];
  updatedAt?: string;
}

export interface PipelineCard extends PipelineStatus {
  description?: string;
  tags?: string[];
  stepCount?: number;
  dependencyPolicy?: DependencyPolicy;
}

export interface StepTrace {
  stepId: string;
  target: string;
  status: "succeeded" | "failed" | "aborted";
  durationMs: number;
  outputBytes?: number;
  outputHash?: string;
  outputPreview?: string;
  downstreamCode?: InvokeErrorCode;
}

export interface PipelineExecutionDetails {
  runId: string;
  pipelineId: string;
  target: string;
  status: "succeeded" | "failed" | "aborted";
  durationMs: number;
  steps: StepTrace[];
  completedSideEffectingSteps: Array<{ stepId: string; target: string; effects: string[] }>;
}

export interface PipelineRunResult {
  output: unknown;
  details: PipelineExecutionDetails;
}

export interface PipelineRuntimeSnapshot {
  spec: Readonly<PipelineSpecV1>;
  dependencies: ReadonlyMap<string, Readonly<DependencySnapshot>>;
  generatedTarget: string;
}

export interface ExecutePipelineOptions {
  invocationContext?: ProtocolInvocationContext;
}

export interface PersistedIndexV1 {
  schemaVersion: 1;
  updatedAt: string;
  pipelines: PipelineStatus[];
}

export interface GeneratedArtifacts {
  spec: PipelineSpecV1;
  manifest: PiProtocolManifest;
}

export interface DryRunStep {
  stepId: string;
  target: string;
  input?: unknown;
  inputValid: boolean;
  error?: string;
}
