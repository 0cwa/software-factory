import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createProtocolFabric, type ProtocolAgentExecutor, type ProtocolFabric, type ProtocolHandler } from "../packages/pi-protocol/core/index.ts";
import { parseProtocolManifest, type ProtocolJsonSchema, type ProtocolProvideContract } from "../packages/pi-protocol/contract/index.ts";
import { createPiSdkAgentExecutor, type PiSdkAgentSessionLike } from "../packages/pi-protocol/sdk/index.ts";
import { createProtocolTool } from "../packages/pi-protocol/tool/index.ts";
import type { ProtocolToolInput, ProtocolToolLike } from "../packages/pi-protocol/tool/types.ts";

interface ScenarioResult { name: string; passed: boolean; latencyMs: number; receipts: number; notes: string; }
interface EvaluationMetrics {
  schemaVersion: 1;
  scenarios: ScenarioResult[];
  discoveryPrecision: number;
  discoveryRecall: number;
  tokensToFirstValidInvocation: number;
  schemaInvalidCallRate: number;
  unnecessaryDescribeCalls: number;
  workflowCompletionRate: number;
  duplicateEffects: number;
  recoverySuccess: number;
  averageDelegationDepth: number;
  loopFanoutViolations: number;
  latencyMs: number;
  modelCostUsd: number;
  provenanceCompleteness: number;
  successAfterUnknownExtension: number;
}

type CallDetails = {
  state: string;
  result: { ok: boolean; output?: unknown; error?: { code: string; message: string } };
  receipt?: { invocationId: string; traceId: string; state: string };
  trace?: { events?: Array<{ status: string; nodeId: string; provide: string; parentSpanId?: string }> };
  causal?: { invocations: Array<{ invocationId: string; parentInvocationId?: string; target: string; state: string }> };
};

class BootstrapAgent {
  readonly tool: ProtocolToolLike;
  toolCalls = 0;
  describeCalls = 0;
  schemaInvalidCalls = 0;
  estimatedTokens = 0;
  receipts = 0;
  completeReceipts = 0;
  constructor(fabric: ProtocolFabric) { this.tool = createProtocolTool(fabric); }

  async use(input: ProtocolToolInput): Promise<any> {
    this.toolCalls += 1;
    if (input.op === "describe") this.describeCalls += 1;
    this.estimatedTokens += Math.ceil(JSON.stringify(input).length / 4);
    const result = await this.tool.execute(`eval-${this.toolCalls}`, input);
    const details = result.details as any;
    if (details?.result?.error?.code === "INPUT_INVALID") this.schemaInvalidCalls += 1;
    if (details?.receipt) {
      this.receipts += 1;
      if (details.receipt.invocationId && details.receipt.traceId && details.receipt.state) this.completeReceipts += 1;
    }
    return details;
  }

  async search(query: string): Promise<any[]> {
    const details = await this.use({ op: "search", query, limit: 12 });
    return details.capabilities ?? [];
  }

  call(target: string, input: unknown, session?: ProtocolToolInput["session"]): Promise<CallDetails> {
    return this.use({ op: "call", target, input, ...(session ? { session } : {}) });
  }
}

export async function evaluateOrchestration(): Promise<EvaluationMetrics> {
  const started = performance.now();
  const fabric = createProtocolFabric({ maxConcurrentInvocations: 8, maxQueuedInvocations: 32, defaultDeadlineMs: 5_000 });
  const agent = new BootstrapAgent(fabric);
  const scenarios: ScenarioResult[] = [];
  let searchMatches = 0;
  let searchRelevant = 0;
  let firstInvocationTokens = 0;
  let duplicateEffects = 0;
  let recoverySuccess = 0;
  let delegationDepthTotal = 0;
  let delegationSamples = 0;
  let loopViolations = 0;

  async function scenario(name: string, operation: () => Promise<string>): Promise<void> {
    const beforeReceipts = agent.receipts;
    const before = performance.now();
    try {
      const notes = await operation();
      scenarios.push({ name, passed: true, latencyMs: round(performance.now() - before), receipts: agent.receipts - beforeReceipts, notes });
    } catch (error) {
      scenarios.push({ name, passed: false, latencyMs: round(performance.now() - before), receipts: agent.receipts - beforeReceipts, notes: error instanceof Error ? error.message : String(error) });
    }
  }

  // The agent exists before this extension is installed and has only the bootstrap tool.
  fabric.install(definition("eval_unknown", [{
    name: "reverse_text", description: "Reverse an arbitrary text value for an unknown-extension evaluation.",
    inputSchema: objectSchema({ text: stringSchema() }, ["text"]),
    outputSchema: objectSchema({ reversed: stringSchema() }, ["reversed"]), tags: ["unknown", "transform"],
  }]), { handlers: { reverse_text: (input) => ({ reversed: [...(input as any).text].reverse().join("") }) } }, { packageId: "@eval/unknown", packageVersion: "1.0.0" });

  await scenario("discover and invoke unknown capability", async () => {
    const capabilities = await agent.search("reverse unknown text");
    searchMatches += capabilities.length;
    searchRelevant += capabilities.filter((item) => item.target === "eval_unknown.reverse_text").length;
    assert.equal(capabilities[0]?.target, "eval_unknown.reverse_text");
    const result = await agent.call(capabilities[0].target, { text: "protocol" });
    firstInvocationTokens = agent.estimatedTokens;
    assert.equal(result.result.ok, true);
    assert.deepEqual(result.result.output, { reversed: "locotorp" });
    return "installed after bootstrap; discovered from lexical catalog and invoked from compact signature";
  });

  fabric.install(definition("eval_compose", [
    provide("seed", "Produce a numeric seed for composition.", objectSchema({}, []), objectSchema({ value: numberSchema() }, ["value"])),
    provide("double", "Double a numeric value produced by another capability.", objectSchema({ value: numberSchema() }, ["value"]), objectSchema({ value: numberSchema() }, ["value"])),
  ]), { handlers: { seed: () => ({ value: 21 }), double: (input) => ({ value: (input as any).value * 2 }) } });

  await scenario("compose output into another provide", async () => {
    const source = (await agent.search("numeric seed composition"))[0];
    const first = await agent.call(source.target, {});
    const sink = (await agent.search("double numeric value"))[0];
    const second = await agent.call(sink.target, first.result.output);
    assert.deepEqual(second.result.output, { value: 42 });
    return "composed strict JSON output without schema-invalid calls";
  });

  const delegationDefinition = definition("eval_delegate", [
    provide("coordinator", "Delegate through two agent-backed stages.", objectSchema({ task: stringSchema() }, ["task"]), objectSchema({ result: stringSchema() }, ["result"])),
    provide("worker", "Second agent-backed delegation stage.", objectSchema({ task: stringSchema() }, ["task"]), objectSchema({ result: stringSchema() }, ["result"])),
  ]);
  const worker: ProtocolAgentExecutor = async (input) => ({ result: `done:${(input as any).task}` });
  const coordinator: ProtocolAgentExecutor = async (input, context) => {
    const child = await context!.invoke!("eval_delegate.worker", input);
    if (!child.ok) throw new Error(child.error.message);
    return child.output;
  };
  fabric.install(delegationDefinition, { agents: { coordinator, worker } });

  await scenario("delegate through two agent-backed provides", async () => {
    const result = await agent.call("eval_delegate.coordinator", { task: "compose" });
    assert.deepEqual(result.result.output, { result: "done:compose" });
    const causal = result.causal?.invocations ?? [];
    const depth = causal.some((invocation) => invocation.target === "eval_delegate.worker" && invocation.parentInvocationId) ? 1 : 0;
    delegationDepthTotal += depth;
    delegationSamples += 1;
    assert.equal(depth, 1);
    return "agent-backed coordinator delegated to an agent-backed worker with a parent span";
  });

  let effectCalls = 0;
  let repairCalls = 0;
  fabric.install(definition("eval_recovery", [
    provide("safe_branch", "Complete the safe workflow branch.", objectSchema({}, []), objectSchema({ artifact: stringSchema() }, ["artifact"])),
    { ...provide("unsafe_branch", "Unsafe effect that must not be retried automatically.", objectSchema({}, []), objectSchema({ artifact: stringSchema() }, ["artifact"])), effects: ["external.transaction"] },
    provide("repair_branch", "Repair only the failed workflow branch from its receipt.", objectSchema({ failedInvocationId: stringSchema() }, ["failedInvocationId"]), objectSchema({ artifact: stringSchema() }, ["artifact"])),
  ]), { handlers: {
    safe_branch: () => ({ artifact: "safe" }),
    unsafe_branch: () => { effectCalls += 1; return { artifact: "unsafe" }; },
    repair_branch: (input) => { repairCalls += 1; return { artifact: `repaired:${(input as any).failedInvocationId}` }; },
  } });

  await scenario("recover only failed branch from provenance", async () => {
    const safe = await agent.call("eval_recovery.safe_branch", {});
    const failed = await agent.call("eval_recovery.unsafe_branch", {});
    assert.equal(safe.result.ok, true);
    assert.equal(failed.result.ok, false);
    assert.equal(failed.result.error?.code, "CONFIRMATION_REQUIRED");
    assert.ok(failed.receipt?.invocationId);
    const repaired = await agent.call("eval_recovery.repair_branch", { failedInvocationId: failed.receipt!.invocationId });
    assert.equal(repaired.result.ok, true);
    assert.equal(effectCalls, 0);
    assert.equal(repairCalls, 1);
    recoverySuccess = 1;
    return "used failed receipt identity; repaired one branch without dispatching or retrying unsafe effect";
  });

  fabric.install(definition("eval_grant", [
    provide("parent", "Attenuate a child grant before delegation.", objectSchema({}, []), objectSchema({ denied: booleanSchema() }, ["denied"])),
    provide("child", "Attempt a forbidden grandchild under an attenuated grant.", objectSchema({}, []), objectSchema({ denied: booleanSchema() }, ["denied"])),
    provide("secret", "Capability outside the child grant.", objectSchema({}, []), objectSchema({ secret: booleanSchema() }, ["secret"])),
  ]), { handlers: {
    parent: async (_input, context) => {
      const child = await context!.invoke!("eval_grant.child", {}, { grant: { targets: ["eval_grant.child"], maxDepth: 2, maxInvocations: 2 } });
      if (!child.ok) throw new Error(child.error.message);
      return child.output;
    },
    child: async (_input, context) => {
      const secret = await context!.invoke!("eval_grant.secret", {}, { grant: { targets: ["*"] } });
      return { denied: !secret.ok && secret.error.code === "FORBIDDEN" };
    },
    secret: () => ({ secret: true }),
  } });

  await scenario("respect attenuated child grant", async () => {
    const result = await agent.call("eval_grant.parent", {});
    assert.deepEqual(result.result.output, { denied: true });
    return "child wildcard request could not broaden its parent scope";
  });

  fabric.install(definition("eval_budget", [
    provide("recurse", "Recurse until the delegated depth budget stops the loop.", objectSchema({ remaining: integerSchema() }, ["remaining"]), objectSchema({ stopped: booleanSchema() }, ["stopped"])),
  ]), { handlers: {
    recurse: async (input, context) => {
      if ((input as any).remaining <= 0) return { stopped: false };
      const child = await context!.invoke!("eval_budget.recurse", { remaining: (input as any).remaining - 1 }, { grant: { targets: ["eval_budget.recurse"], maxDepth: 1, maxInvocations: 2 } });
      if (child.ok) return child.output;
      return { stopped: child.error.code === "OVERLOADED" || child.error.code === "DEADLINE_EXCEEDED" };
    },
  } });

  await scenario("stop under call depth and deadline budget", async () => {
    const result = await agent.call("eval_budget.recurse", { remaining: 10 });
    assert.deepEqual(result.result.output, { stopped: true });
    if ((result.trace?.events?.filter((event) => event.status === "started").length ?? 0) > 3) loopViolations += 1;
    return "recursive fan-out stopped within the attenuated depth/invocation budget";
  });

  await scenario("avoid retrying unsafe effect", async () => {
    const before = effectCalls;
    const failed = await agent.call("eval_recovery.unsafe_branch", {});
    assert.equal(failed.result.error?.code, "CONFIRMATION_REQUIRED");
    assert.equal(effectCalls, before);
    duplicateEffects += effectCalls - before;
    return "unsafe capability was attempted once and never dispatched without host approval";
  });

  let createdSessions = 0;
  let disposedSessions = 0;
  const continuable = createPiSdkAgentExecutor({
    createSession: () => {
      createdSessions += 1;
      let turn = 0;
      const listeners = new Set<(event: any) => void>();
      const session: PiSdkAgentSessionLike = {
        async prompt() {
          turn += 1;
          const text = JSON.stringify({ turn });
          for (const listener of listeners) listener({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: text } });
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        dispose() { disposedSessions += 1; listeners.clear(); },
      };
      return session;
    },
    toOutput: (text) => JSON.parse(text),
    sessionCache: { ttlMs: 30_000, maxSessions: 4 },
  });
  fabric.install(definition("eval_session", [
    { ...provide("continue_work", "Continue a digest-pinned bounded operation.", objectSchema({}, []), objectSchema({ turn: integerSchema() }, ["turn"])), traits: { interaction: "continuable" } },
  ]), { agents: { continue_work: continuable } });

  await scenario("resume a continuable operation", async () => {
    const first = await agent.call("eval_session.continue_work", {}, { id: "evaluation-session", mode: "continue" });
    const second = await agent.call("eval_session.continue_work", {}, { id: "evaluation-session", mode: "continue" });
    await agent.call("eval_session.continue_work", {}, { id: "evaluation-session", mode: "end" });
    assert.deepEqual(first.result.output, { turn: 1 });
    assert.deepEqual(second.result.output, { turn: 2 });
    assert.equal(createdSessions, 1);
    assert.equal(disposedSessions, 1);
    return "continued one serialized session and disposed it deterministically on end";
  });

  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  const atomicV1 = definition("eval_atomic", [provide("read", "Read the generation-pinned implementation.", objectSchema({}, []), objectSchema({ generation: integerSchema() }, ["generation"]))]);
  const atomicV2 = parseProtocolManifest({ ...atomicV1.manifest, node: { ...atomicV1.manifest.node, purpose: "Atomic replacement generation two." } });
  const registration = fabric.install(atomicV1, { handlers: { read: async () => { await oldGate; return { generation: 1 }; } } });

  await scenario("handle atomic contract replacement", async () => {
    const oldCall = agent.call("eval_atomic.read", {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    const replacing = registration.replace(atomicV2, { handlers: { read: () => ({ generation: 2 }) } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newCall = await agent.call("eval_atomic.read", {});
    releaseOld();
    const oldResult = await oldCall;
    await replacing;
    assert.deepEqual(oldResult.result.output, { generation: 1 });
    assert.deepEqual(newCall.result.output, { generation: 2 });
    return "old call stayed pinned while the new generation became immediately discoverable";
  });

  await scenario("explain causal chain of final artifact", async () => {
    const result = await agent.call("eval_delegate.coordinator", { task: "artifact" });
    const chain = (result.causal?.invocations ?? []).map((invocation) => invocation.target);
    assert.deepEqual(chain, ["eval_delegate.coordinator", "eval_delegate.worker"]);
    const explanation = `final artifact came from ${chain.join(" -> ")} under trace ${result.receipt?.traceId}`;
    assert.match(explanation, /coordinator -> eval_delegate\.worker/);
    return explanation;
  });

  const completed = scenarios.filter((item) => item.passed).length;
  const metrics: EvaluationMetrics = {
    schemaVersion: 1,
    scenarios,
    discoveryPrecision: searchMatches ? round(searchRelevant / searchMatches, 4) : 0,
    discoveryRecall: searchRelevant ? 1 : 0,
    tokensToFirstValidInvocation: firstInvocationTokens,
    schemaInvalidCallRate: agent.toolCalls ? round(agent.schemaInvalidCalls / agent.toolCalls, 4) : 0,
    unnecessaryDescribeCalls: agent.describeCalls,
    workflowCompletionRate: round(completed / scenarios.length, 4),
    duplicateEffects,
    recoverySuccess,
    averageDelegationDepth: delegationSamples ? round(delegationDepthTotal / delegationSamples, 4) : 0,
    loopFanoutViolations: loopViolations,
    latencyMs: round(performance.now() - started),
    modelCostUsd: 0,
    provenanceCompleteness: agent.receipts ? round(agent.completeReceipts / agent.receipts, 4) : 0,
    successAfterUnknownExtension: scenarios[0]?.passed ? 1 : 0,
  };
  assertThresholds(metrics);
  return metrics;
}

function assertThresholds(metrics: EvaluationMetrics): void {
  assert.equal(metrics.scenarios.length, 10);
  assert.equal(metrics.workflowCompletionRate, 1, JSON.stringify(metrics.scenarios.filter((scenario) => !scenario.passed)));
  assert.equal(metrics.discoveryPrecision, 1);
  assert.equal(metrics.discoveryRecall, 1);
  assert.equal(metrics.schemaInvalidCallRate, 0);
  assert.equal(metrics.unnecessaryDescribeCalls, 0);
  assert.equal(metrics.duplicateEffects, 0);
  assert.equal(metrics.recoverySuccess, 1);
  assert.equal(metrics.loopFanoutViolations, 0);
  assert.equal(metrics.provenanceCompleteness, 1);
  assert.equal(metrics.successAfterUnknownExtension, 1);
}

function definition(nodeId: string, provides: ProtocolProvideContract[]) {
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: { id: nodeId, purpose: `Orchestration evaluation node ${nodeId}.`, tags: ["evaluation"] },
    provides,
  });
}
function provide(name: string, description: string, inputSchema: ProtocolJsonSchema, outputSchema: ProtocolJsonSchema): ProtocolProvideContract {
  return { name, description, inputSchema, outputSchema };
}
function objectSchema(properties: Record<string, ProtocolJsonSchema>, required: string[]): ProtocolJsonSchema { return { type: "object", properties, required, additionalProperties: false }; }
function stringSchema(): ProtocolJsonSchema { return { type: "string", maxLength: 4_096 }; }
function numberSchema(): ProtocolJsonSchema { return { type: "number" }; }
function integerSchema(): ProtocolJsonSchema { return { type: "integer" }; }
function booleanSchema(): ProtocolJsonSchema { return { type: "boolean" }; }
function round(value: number, digits = 2): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const metrics = await evaluateOrchestration();
  console.log(JSON.stringify(metrics, null, 2));
}
