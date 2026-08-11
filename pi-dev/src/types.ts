export interface AgentRequestBase {
  task: string;
  context?: string;
}

export interface ScoutRequest extends AgentRequestBase {
  scope?: string[];
  questions?: string[];
}

export interface ArchitectRequest extends AgentRequestBase {
  constraints?: string[];
}

export interface WorkerRequest extends AgentRequestBase {
  plan?: string[];
  acceptanceCriteria?: string[];
}

export interface ReviewerRequest extends AgentRequestBase {
  diff?: string;
  commit?: string;
  range?: string;
  acceptanceCriteria?: string[];
  testExpectations?: string[];
}

export interface SecurityReviewerRequest extends ReviewerRequest {
  securityFocus?: string[];
}

export interface AgentOutputBase {
  diagnostics: string[];
  message: string;
}

export interface ScoutOutput extends AgentOutputBase {
  summary: string;
  files: Array<{ path: string; line?: number; relevance: string }>;
  codePaths: Array<{ from: string; to: string; relationship: string }>;
  findings: string[];
  unresolvedQuestions: string[];
}

export interface ArchitectOutput extends AgentOutputBase {
  summary: string;
  assumptions: string[];
  plan: Array<{ order: number; action: string; rationale: string }>;
  risks: Array<{ risk: string; mitigation: string }>;
  acceptanceCriteria: string[];
}

export interface TestResult {
  command: string;
  status: "passed" | "failed" | "skipped";
  output: string;
}

export interface WorkerOutput extends AgentOutputBase {
  summary: string;
  changedFiles: Array<{ path: string; change: string }>;
  tests: TestResult[];
  unresolvedIssues: string[];
}

export interface ReviewerOutput extends AgentOutputBase {
  summary: string;
  verdict: "approve" | "request_changes" | "blocked";
  findings: Array<{
    severity: "blocker" | "high" | "medium" | "low" | "info";
    file: string;
    line?: number;
    explanation: string;
    recommendedFix: string;
  }>;
  testResults: TestResult[];
}

export interface SecurityReviewerOutput extends AgentOutputBase {
  summary: string;
  verdict: "approve" | "request_changes" | "blocked";
  threatModel: Array<{ asset: string; threat: string; mitigation: string }>;
  findings: Array<{
    severity: "blocker" | "high" | "medium" | "low" | "info";
    area: string;
    file: string;
    line?: number;
    exploitability: "none" | "low" | "medium" | "high";
    explanation: string;
    recommendedFix: string;
  }>;
  testResults: TestResult[];
}
