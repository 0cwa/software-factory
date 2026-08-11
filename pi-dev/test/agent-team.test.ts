async function invokeResult(fabric: { invokeTracked(request: any): Promise<any> }, request: any): Promise<any> {
  return (await fabric.invokeTracked(request)).result;
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  createProtocolFabric,
  type ProtocolInvocationContext,
  type ExecutionEventV1,
} from "@kybernetria/pi-protocol/core";
import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";
import type { PiSdkAgentSessionEventLike, PiSdkAgentSessionLike } from "@kybernetria/pi-protocol/pi/agents";
import { createPiSdkAgentExecutorsFromProfiles } from "@kybernetria/pi-protocol/pi/agents";
import manifest from "../pi.protocol.json" with { type: "json" };
import profilesJson from "../pi.agents.json" with { type: "json" };
import { createAgentExecutors } from "../protocol/agents.ts";
import { architectDefinition, reviewerDefinition, scoutDefinition, securityReviewerDefinition, workerDefinition } from "../src/roles/index.ts";
import type { AgentDefinition } from "../src/runtime/definition.ts";
import { agentProfiles, provideContractFor, protocolDefinition } from "../src/runtime/manifest.ts";
import { parseAgentOutput, prepareAgentInput, type PreparedAgentInput } from "../src/runtime/run-agent.ts";
import type { AgentOutputBase, AgentRequestBase } from "../src/types.ts";

const definition = parseProtocolManifest(manifest);
const roles = ["scout", "architect", "worker", "reviewer", "security_reviewer"] as const;
type Role = typeof roles[number];
type SessionRun = (role: Role, prompt: string, session: FakeSession) => string | Promise<string>;

class FakeSession implements PiSdkAgentSessionLike {
  private readonly listeners = new Set<(event: PiSdkAgentSessionEventLike) => void>();
  private rejectPending?: (error: Error) => void;
  private disposed = false;
  readonly model: { provider: string; id: string };
  readonly thinkingLevel: string;
  protocolContext: unknown;
  controlContext: unknown;

  constructor(readonly role: Role, private readonly run: SessionRun) {
    const policy = profilesJson.agents[role].modelPolicy;
    const [provider, id] = policy.specific.split("/", 2);
    this.model = { provider, id };
    this.thinkingLevel = policy.thinkingLevel;
  }

  async prompt(prompt: string): Promise<void> {
    if (this.disposed) throw new Error("session disposed");
    const output = await new Promise<string>((resolve, reject) => {
      this.rejectPending = reject;
      Promise.resolve(this.run(this.role, prompt, this)).then(resolve, reject);
    }).finally(() => { this.rejectPending = undefined; });
    for (const listener of this.listeners) {
      listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: output } });
    }
  }
  subscribe(listener: (event: PiSdkAgentSessionEventLike) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  dispose(): void {
    this.disposed = true;
    this.rejectPending?.(new Error("session disposed"));
    this.listeners.clear();
  }
  setProtocolInvocationContext(context: unknown): void { this.protocolContext = context; }
  setProtocolControlContext(context: unknown): void { this.controlContext = context; }
}

function outputFor(role: string): string {
  if (role === "scout") return JSON.stringify({
    summary: "Located flow", files: [{ path: "src/auth.ts", line: 12, relevance: "Starts token refresh" }],
    codePaths: [{ from: "src/router.ts", to: "src/auth.ts", relationship: "Calls refresh handler" }],
    findings: ["Refresh starts in auth.ts"], unresolvedQuestions: [], diagnostics: [], message: "Scout complete.",
  });
  if (role === "architect") return JSON.stringify({
    summary: "Plan ready", assumptions: ["Existing API remains stable"], plan: [{ order: 1, action: "Implement", rationale: "Required" }],
    risks: [{ risk: "Regression", mitigation: "Run tests" }], acceptanceCriteria: ["Tests pass"], diagnostics: [], message: "Architecture complete.",
  });
  if (role === "worker") return JSON.stringify({
    summary: "Implemented", changedFiles: [{ path: "a.ts", change: "Updated" }],
    tests: [{ command: "npm test", status: "passed", output: "ok" }], unresolvedIssues: [], diagnostics: [], message: "Work complete.",
  });
  if (role === "security_reviewer") return JSON.stringify({
    summary: "Security reviewed", verdict: "approve",
    threatModel: [{ asset: "credentials", threat: "disclosure", mitigation: "redaction" }],
    findings: [{ severity: "low", area: "logging", file: "src/auth.ts", line: 12, exploitability: "low", explanation: "Metadata is logged", recommendedFix: "Redact it" }],
    testResults: [{ command: "npm test", status: "passed", output: "ok" }], diagnostics: [], message: "Security review complete.",
  });
  return JSON.stringify({
    summary: "Reviewed", verdict: "approve",
    findings: [{ severity: "info", file: "src/auth.ts", line: 12, explanation: "Flow is correct", recommendedFix: "None" }],
    testResults: [{ command: "npm test", status: "passed", output: "ok" }], diagnostics: [], message: "Review complete.",
  });
}

const roleDefinitions: Record<Role, AgentDefinition<AgentRequestBase, AgentOutputBase>> = {
  scout: scoutDefinition,
  architect: architectDefinition,
  worker: workerDefinition,
  reviewer: reviewerDefinition,
  security_reviewer: securityReviewerDefinition,
};

function executors(run: SessionRun = (role) => outputFor(role), limits: { maxPromptChars?: number; maxResponseChars?: number } = {}) {
  const sdkExecutors = createPiSdkAgentExecutorsFromProfiles(protocolDefinition, agentProfiles, {
    agentByProvide: Object.fromEntries(roles.map((role) => [role, role])),
    createSessionForAgent: (agentName) => () => new FakeSession(agentName as Role, run),
    toPromptByAgent: () => (input: unknown) => (input as PreparedAgentInput).prompt,
    toOutputByAgent: () => (text: string, input: unknown) => parseAgentOutput(text, input as PreparedAgentInput),
  });
  return Object.fromEntries(roles.map((role) => [role, (input: unknown, context?: ProtocolInvocationContext) => {
    const prepared = prepareAgentInput(roleDefinitions[role], input as AgentRequestBase, provideContractFor(role), limits);
    return sdkExecutors[role](prepared, context);
  }]));
}

function registered(run?: SessionRun) {
  const fabric = createProtocolFabric();
  fabric.install(definition, { agents: executors(run) });
  return fabric;
}

test("production executors use the standard profile-backed factory", () => {
  assert.equal(createAgentExecutors.length, 0);
  assert.deepEqual(Object.keys(createAgentExecutors()), roles);
});

test("manifest exposes exactly five deployment-neutral agent contracts", () => {
  const fabric = registered();
  const node = fabric.describeNode("pi_dev");
  assert.deepEqual(node?.provides.map((provide) => provide.name), roles);
  assert.equal("agents" in (node ?? {}), false);
  for (const provide of definition.manifest.provides) {
    assert.equal("cwd" in (provide.inputSchema.properties ?? {}), false);
    assert.deepEqual(provide.inputSchema.required, ["task"]);
    assert.equal(provide.inputSchema.additionalProperties, false);
  }
});

test("private profiles statically own tools, model, thinking, grants, and continuation", () => {
  assert.deepEqual(profilesJson.agents.scout.tools, ["read", "grep", "find", "ls"]);
  assert.equal(profilesJson.agents.scout.modelPolicy.class, "fast");
  assert.equal(profilesJson.agents.scout.modelPolicy.thinkingLevel, "low");
  assert.deepEqual(profilesJson.agents.worker.tools, ["read", "grep", "find", "ls", "bash", "edit", "write", "protocol"]);
  for (const role of ["architect", "worker", "reviewer", "security_reviewer"] as const) {
    assert.deepEqual(profilesJson.agents[role].protocolAccess.targets, ["pi_dev.scout"]);
    assert.equal(profilesJson.agents[role].tools.includes("protocol"), true);
    assert.equal(profilesJson.agents[role].continuation.maxSessions, 8);
  }
  assert.equal(profilesJson.agents.reviewer.tools.includes("review_command" as never), false);
  assert.equal(profilesJson.agents.reviewer.tools.includes("bash"), true);
  assert.equal(profilesJson.agents.security_reviewer.tools.includes("bash"), true);
});

test("all role executors produce schema-compatible structured output", async () => {
  const fabric = registered();
  for (const role of roles) {
    const result = await invokeResult(fabric, { nodeId: "pi_dev", provide: role, input: { task: "Do it" } });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) assert.equal(typeof (result.output as { message: unknown }).message, "string");
  }
});

test("output schemas reject missing and malformed role-specific output", async () => {
  const invalidate = {
    scout: (value: any) => { value.files[0].line = 1.5; },
    architect: (value: any) => { value.plan[0].order = "first"; },
    worker: (value: any) => { value.tests[0].status = "unknown"; },
    reviewer: (value: any) => { value.findings[0].severity = "critical"; },
    security_reviewer: (value: any) => { value.findings[0].exploitability = "certain"; },
  };
  for (const role of roles) {
    const provide = definition.manifest.provides.find((item) => item.name === role)!;
    const valid = JSON.parse(outputFor(role));
    for (const required of provide.outputSchema.required ?? []) {
      const missing = structuredClone(valid);
      delete missing[required];
      const result = await invokeRaw(role, missing);
      assert.equal(result.ok, false, `${role} requires ${required}`);
      if (!result.ok) assert.equal(result.error.code, "OUTPUT_INVALID");
    }
    const malformed = structuredClone(valid);
    invalidate[role](malformed);
    const result = await invokeRaw(role, malformed);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "OUTPUT_INVALID");
  }
});

async function invokeRaw(role: Role, output: unknown) {
  const fabric = createProtocolFabric();
  fabric.install(definition, { agents: Object.fromEntries(roles.map((name) => [name, () => name === role ? output : JSON.parse(outputFor(name))])) });
  return invokeResult(fabric, { nodeId: "pi_dev", provide: role, input: { task: "Validate" } });
}

test("runtime rejects missing, empty, and removed dynamic deployment fields", async () => {
  const fabric = registered();
  const missing = await invokeResult(fabric, { nodeId: "pi_dev", provide: "architect", input: {} });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "INPUT_INVALID");
  const empty = await invokeResult(fabric, { nodeId: "pi_dev", provide: "architect", input: { task: "" } });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error.code, "EXECUTION_FAILED");
  const cwd = await invokeResult(fabric, { nodeId: "pi_dev", provide: "architect", input: { task: "Plan", cwd: "/tmp" } });
  assert.equal(cwd.ok, false);
  if (!cwd.ok) assert.equal(cwd.error.code, "INPUT_INVALID");
  const model = await invokeResult(fabric, { nodeId: "pi_dev", provide: "architect", input: { task: "Plan", model: "forged" } });
  assert.equal(model.ok, false);
  if (!model.ok) assert.equal(model.error.code, "INPUT_INVALID");
});

test("prepared prompts contain task details but no deployment configuration", () => {
  const prepared = prepareAgentInput(
    scoutDefinition,
    { task: "Trace refresh", scope: ["src/auth"], questions: ["Who calls refresh?"] },
    provideContractFor("scout"),
  );
  assert.match(prepared.prompt, /src\/auth/);
  assert.match(prepared.prompt, /Who calls refresh\?/);
  assert.match(prepared.prompt, /host session working directory/);
  assert.equal("cwd" in prepared, false);
  assert.equal("model" in prepared, false);
  assert.equal("thinkingLevel" in prepared, false);
});

test("executor emits standard model and output telemetry", async () => {
  const events: ExecutionEventV1[] = [];
  const fabric = registered();
  fabric.subscribeExecution((event) => { events.push(event); });
  const result = await invokeResult(fabric, { nodeId: "pi_dev", provide: "architect", input: { task: "Plan" } });
  assert.equal(result.ok, true);
  assert.deepEqual(events.map((event) => event.type), ["executor.session", "executor.output_delta"]);
  const model = events[0];
  assert.equal(model?.type, "executor.session");
  if (model?.type === "executor.session") {
    assert.equal(model.model, profilesJson.agents.architect.modelPolicy.specific);
    assert.equal(model.thinkingLevel, profilesJson.agents.architect.modelPolicy.thinkingLevel);
  }
});

test("caller cancellation disposes the standard executor session", async () => {
  let started!: () => void;
  const didStart = new Promise<void>((resolve) => { started = resolve; });
  const fabric = registered((_role, _prompt) => new Promise<string>(() => { started(); }));
  const controller = new AbortController();
  const pending = invokeResult(fabric, { nodeId: "pi_dev", provide: "reviewer", input: { task: "Wait" }, abortSignal: controller.signal });
  await didStart;
  controller.abort();
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "OUTCOME_UNKNOWN");
});

test("malformed, failed, and oversized output fail clearly", async () => {
  for (const run of [
    async () => "not json",
    async () => { throw new Error("model unavailable"); },
    async () => "x".repeat(100),
  ] satisfies SessionRun[]) {
    const agent = executors(run, { maxResponseChars: 20 }).architect;
    await assert.rejects(() => Promise.resolve(agent?.({ task: "Plan" }, { nodeId: "pi_dev", provide: "architect" } as ProtocolInvocationContext)));
  }
});

test("prompt truncation is diagnosed in structured output", async () => {
  let prompt = "";
  const agent = executors((role, value) => { prompt = value; return outputFor(role); }, { maxPromptChars: 80 }).architect;
  const output = await agent?.({ task: "x".repeat(500) }, { nodeId: "pi_dev", provide: "architect" }) as { diagnostics: string[]; message: string };
  assert.match(prompt, /DIAGNOSTIC: input was truncated/);
  assert.match(output.diagnostics[0] ?? "", /truncated/);
  assert.match(output.message, /truncated/);
});

// Keep the role definition imported and type-checked against the static prompt path.
test("architect role shaping remains independent of session deployment", () => {
  const details = architectDefinition.buildTaskDetails({ task: "Plan", constraints: ["No API changes"] });
  assert.deepEqual(details, { constraints: ["No API changes"] });
});
