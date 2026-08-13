import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostname, tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { createPiProtocolCapabilityPort, createPlanChangeRuntime, loadPlanChangeCatalog, RuntimeRepository } from "../dist/index.js";

const exec = promisify(execFile);
const catalog = await loadPlanChangeCatalog();

async function repositoryFixture() {
  const root = await mkdtemp(join(tmpdir(), "factory-runtime-repo-"));
  await exec("git", ["init", "-q", "-b", "main"], { cwd: root });
  await exec("git", ["config", "user.email", "factory@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "Factory Test"], { cwd: root });
  await writeFile(join(root, "README.md"), "fixture\n");
  await exec("git", ["add", "README.md"], { cwd: root });
  await exec("git", ["commit", "-qm", "fixture"] , { cwd: root });
  return root;
}

function scout() {
  return { summary: "small repository", files: [{ path: "README.md", line: 1, relevance: "fixture" }], codePaths: [], findings: ["bounded"], unresolvedQuestions: [], diagnostics: [], message: "complete" };
}

function architect({ complete = true } = {}) {
  return {
    summary: "plan summary",
    assumptions: complete ? ["safe"] : [],
    plan: complete ? [{ order: 1, action: "inspect", rationale: "preserve ownership" }] : [],
    risks: complete ? [{ risk: "drift", mitigation: "gate" }] : [],
    acceptanceCriteria: complete ? ["evidence"] : [],
    diagnostics: [],
    message: "complete",
  };
}

function fakeFabric(mode = "accepted", { delayMs = 0 } = {}) {
  const calls = [];
  const principals = [];
  return {
    calls,
    principals,
    mintPrincipal(id, kind) {
      principals.push({ id, kind });
      return { id, kind };
    },
    async invokeAs(principal, target, input, options) {
      calls.push({ principal, target, input, options });
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const index = calls.length;
      const receiptState = mode === "protocol-rejected" ? "rejected" : mode === "cancelled" ? "cancelled" : mode === "unknown" ? "outcome_unknown" : mode === "failed" ? "failed" : "succeeded";
      const receipt = { schemaVersion: 1, invocationId: `fake-${index}`, revision: 1, state: receiptState, traceId: `trace-${index}`, spanId: `span-${index}`, target, requestedAt: 1, effectsMayHaveOccurred: receiptState !== "rejected", childInvocationIds: [], externalAudit: "not_configured" };
      if (mode === "throw") throw new Error("transport interrupted");
      if (mode === "malformed") return null;
      if (mode === "unknown") return { ok: false, error: { code: "OUTCOME_UNKNOWN", message: "interrupted" }, result: { ok: false }, receipt };
      if (["protocol-rejected", "failed", "cancelled"].includes(mode)) return { ok: false, error: { code: mode === "cancelled" ? "CANCELLED" : mode === "protocol-rejected" ? "FORBIDDEN" : "EXECUTION_FAILED", message: "declined" }, result: { ok: false }, receipt };
      return { ok: true, output: mode === "bad-output" ? {} : target === "pi_dev.scout" ? scout() : architect({ complete: mode !== "rejected" }), result: { ok: true }, receipt };
    },
  };
}

async function runtimeFixture(mode = "accepted", options = {}) {
  const repositoryRoot = await repositoryFixture();
  const runtimeRoot = join(repositoryRoot, ".pi", "factory", "runtime");
  const fabric = fakeFabric(mode, options);
  const port = createPiProtocolCapabilityPort(fabric);
  const runtime = createPlanChangeRuntime({ runtimeRoot, repositoryRoot, catalog, capabilityPort: port });
  return { repositoryRoot, runtimeRoot, runtime, port, fabric };
}

async function clean(root) {
  await rm(root, { recursive: true, force: true });
}

test("Protocol adapter forwards the exact attenuated public invocation", async () => {
  let seen;
  const signal = new AbortController().signal;
  const deadline = Date.now() + 1000;
  const fabric = {
    mintPrincipal: (id, kind) => ({ id, kind }),
    invokeAs: async (principal, target, input, options) => {
      seen = { principal, target, input, options };
      return { ok: true, output: scout(), result: { ok: true }, receipt: { schemaVersion: 1, invocationId: "adapter-1", revision: 1, state: "succeeded", traceId: "trace", spanId: "span", target, requestedAt: 1, effectsMayHaveOccurred: false, childInvocationIds: [], externalAudit: "not_configured" } };
    },
  };
  const port = createPiProtocolCapabilityPort(fabric);
  const result = await port.dispatch("pi_dev.scout", { runId: "run", phaseId: "scout", target: "pi_dev.scout", input: { task: "task" }, inputDigest: "digest", workflowDigest: "workflow", prompt: { id: "prompt", kind: "prompt", path: "prompt.md" }, repositoryIdentityDigest: "repo", environmentIdentityDigest: "env", signal, deadline });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(seen.principal, { id: "workflow:software-factory", kind: "agent" });
  assert.equal(seen.target, "pi_dev.scout");
  assert.deepEqual(seen.input, { task: "task" });
  assert.deepEqual(seen.options.grant, { targets: ["pi_dev.scout"], effects: ["fs.read", "model.call"], maxDepth: 0, maxInvocations: 1 });
  assert.equal(seen.options.signal, signal);
  assert.equal(seen.options.deadline, deadline);
});

test("accepted execution is sequential, receipt-backed, bounded, and mutation-free", async () => {
  const fixture = await runtimeFixture();
  try {
    const result = await fixture.runtime.start({ requestId: "req-accepted", task: "plan safely", constraints: ["bounded"] }, "run-accepted");
    assert.equal(result.status, "accepted");
    assert.deepEqual(fixture.fabric.calls.map((call) => call.target), ["pi_dev.scout", "pi_dev.architect"]);
    assert.equal(fixture.fabric.calls[0].input.task, "plan safely");
    assert.deepEqual(fixture.fabric.principals, [{ id: "workflow:software-factory", kind: "agent" }]);
    assert.deepEqual(fixture.fabric.calls[0].options.grant, { targets: ["pi_dev.scout"], effects: ["fs.read", "model.call"], maxDepth: 0, maxInvocations: 1 });
    assert.deepEqual(fixture.fabric.calls[1].options.grant, { targets: ["pi_dev.architect", "pi_dev.scout"], effects: ["fs.read", "model.call", "protocol.invoke"], maxDepth: 4, maxInvocations: 16 });
    assert.deepEqual(fixture.fabric.calls[0].input, { task: "plan safely" });
    assert.equal(fixture.fabric.calls[0].input.constraints, undefined);
    assert.deepEqual(fixture.fabric.calls[1].input.constraints, ["bounded"]);
    assert.equal(fixture.fabric.calls[0].options.signal instanceof AbortSignal, true);
    assert.ok(fixture.fabric.calls[0].options.deadline > Date.now());
    const inspection = await fixture.runtime.inspect("run-accepted");
    assert.equal(inspection.valid, true);
    assert.equal(inspection.uncertainInvocation, false);
    assert.equal(inspection.run.status, "succeeded");
    assert.match(inspection.run.taskDigest, /^[a-f0-9]{64}$/);
    assert.ok(inspection.events.some((event) => event.type === "capability.dispatch_intent"));
    assert.ok(inspection.events.some((event) => event.type === "capability.dispatch_result"));
    const journal = await readFile(join(fixture.runtimeRoot, "run-accepted", "journal.jsonl"), "utf8");
    assert.doesNotMatch(journal, /plan safely/);
    assert.doesNotMatch(journal, /input\":/);
  } finally { await clean(fixture.repositoryRoot); }
});

test("pre-aborted request is a definitive local cancellation with no invocation", async () => {
  const fixture = await runtimeFixture();
  const controller = new AbortController();
  controller.abort();
  try {
    const result = await fixture.runtime.start({ requestId: "req-pre-aborted", task: "plan", signal: controller.signal }, "run-pre-aborted");
    assert.equal(result.status, "failed");
    assert.equal(fixture.fabric.calls.length, 0);
    const inspection = await fixture.runtime.inspect("run-pre-aborted");
    assert.equal(inspection.uncertainInvocation, false);
    assert.match(inspection.events.find((event) => event.type === "phase.result").data.diagnosticCodes[0], /cancelled-before-dispatch/);
  } finally { await clean(fixture.repositoryRoot); }
});

test("external request cancellation reaches the capability and remains an unknown outcome", async () => {
  const fixture = await runtimeFixture();
  const controller = new AbortController();
  fixture.fabric.invokeAs = async (principal, target, input, options) => {
    fixture.fabric.calls.push({ principal, target, input, options });
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { ok: true, output: target === "pi_dev.scout" ? scout() : architect(), result: { ok: true }, receipt: { schemaVersion: 1, invocationId: "late-cancel-success", revision: 1, state: "succeeded", traceId: "trace-cancel", spanId: "span-cancel", target, requestedAt: 1, effectsMayHaveOccurred: true, childInvocationIds: [], externalAudit: "not_configured" } };
  };
  const promise = fixture.runtime.start({ requestId: "req-cancel", task: "plan", signal: controller.signal }, "run-cancel");
  for (let attempt = 0; attempt < 100 && fixture.fabric.calls.length === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(fixture.fabric.calls.length, 1);
  controller.abort();
  try {
    const result = await promise;
    assert.equal(result.status, "outcome_unknown");
    assert.equal(fixture.fabric.calls[0].options.signal.aborted, true);
    assert.equal((await fixture.runtime.inspect("run-cancel")).uncertainInvocation, true);
  } finally { await clean(fixture.repositoryRoot); }
});

test("rejected acceptance remains distinct from execution failure", async () => {
  const fixture = await runtimeFixture("rejected");
  try {
    const result = await fixture.runtime.start({ requestId: "req-rejected", task: "plan" }, "run-rejected");
    assert.equal(result.status, "rejected");
    assert.equal(result.acceptance.accepted, false);
    assert.ok(result.acceptance.gateReports.some((report) => report.gateId === "structured-sections" && !report.passed));
    assert.equal((await fixture.runtime.inspect("run-rejected")).run.status, "rejected");
  } finally { await clean(fixture.repositoryRoot); }
});

test("capability failure and unknown outcomes are truthful and never replayed", async () => {
  for (const mode of ["protocol-rejected", "failed", "cancelled", "unknown"]) {
    const fixture = await runtimeFixture(mode);
    try {
      const result = await fixture.runtime.start({ requestId: `req-${mode}`, task: "plan" }, `run-${mode}`);
      assert.equal(result.status, mode === "unknown" ? "outcome_unknown" : "failed");
      assert.equal(fixture.fabric.calls.length, 1);
      const inspection = await fixture.runtime.inspect(`run-${mode}`);
      const dispatchEvent = inspection.events.find((event) => event.type === "capability.dispatch_result");
      assert.equal(dispatchEvent.data.receipt.state, mode === "unknown" ? "outcome_unknown" : mode === "protocol-rejected" ? "rejected" : mode === "cancelled" ? "cancelled" : "failed");
      assert.equal(inspection.uncertainInvocation, mode === "unknown");
      if (mode === "unknown") {
        await assert.rejects(() => fixture.runtime.resume(`run-${mode}`), /uncertain capability invocation/);
        await fixture.runtime.abandon(`run-${mode}`, "test-operator");
        assert.equal((await fixture.runtime.inspect(`run-${mode}`)).run.status, "abandoned");
      }
    } finally { await clean(fixture.repositoryRoot); }
  }
});

test("interrupted invocation leaves intent without a replayable resume", async () => {
  const fixture = await runtimeFixture();
  fixture.fabric.invokeAs = async () => { throw new Error("transport interrupted"); };
  try {
    const result = await fixture.runtime.start({ requestId: "req-interrupted", task: "plan" }, "run-interrupted");
    assert.equal(result.status, "outcome_unknown");
    assert.equal((await fixture.runtime.inspect("run-interrupted")).uncertainInvocation, true);
    await assert.rejects(() => fixture.runtime.resume("run-interrupted"), /uncertain capability invocation/);
  } finally { await clean(fixture.repositoryRoot); }
});

test("duplicate claims are exclusive and nonterminal resume is read-only", async () => {
  const fixture = await runtimeFixture("unknown");
  try {
    const attempts = await Promise.allSettled([
      fixture.runtime.start({ requestId: "req-duplicate", task: "plan" }, "run-duplicate"),
      fixture.runtime.start({ requestId: "req-duplicate", task: "plan" }, "run-duplicate"),
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
    const journalPath = join(fixture.runtimeRoot, "run-duplicate", "journal.jsonl");
    const before = await readFile(journalPath, "utf8");
    await assert.rejects(() => fixture.runtime.resume("run-duplicate"), /uncertain capability invocation/);
    assert.equal(await readFile(journalPath, "utf8"), before);
    assert.equal(fixture.fabric.calls.length, 1);
  } finally { await clean(fixture.repositoryRoot); }
});

test("dispatch timeout stays unknown and may retain a prompt unknown receipt", async () => {
  const fixture = await runtimeFixture();
  fixture.fabric.invokeAs = async (principal, target, input, options) => { fixture.fabric.calls.push({ principal, target, input, options }); await new Promise((resolve) => setTimeout(resolve, 40)); return { ok: false, error: { code: "OUTCOME_UNKNOWN", message: "interrupted" }, result: { ok: false }, receipt: { schemaVersion: 1, invocationId: `timeout-${fixture.fabric.calls.length}`, revision: 1, state: "outcome_unknown", traceId: "trace-timeout", spanId: "span-timeout", target, requestedAt: 1, effectsMayHaveOccurred: true, childInvocationIds: [], externalAudit: "not_configured" } }; };
  fixture.runtime = createPlanChangeRuntime({ runtimeRoot: fixture.runtimeRoot, repositoryRoot: fixture.repositoryRoot, catalog, capabilityPort: fixture.port, dispatchTimeoutMs: 5, dispatchGraceMs: 200 });
  try {
    const result = await fixture.runtime.start({ requestId: "req-timeout", task: "plan" }, "run-timeout");
    assert.equal(result.status, "outcome_unknown");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const inspection = await fixture.runtime.inspect("run-timeout");
    assert.equal(inspection.uncertainInvocation, true);
    assert.equal(inspection.events.find((event) => event.type === "capability.dispatch_result").data.receipt.state, "outcome_unknown");
    assert.equal(fixture.fabric.calls.length, 1);
  } finally { await clean(fixture.repositoryRoot); }
});

test("synchronous event-loop blocking settlement after the deadline stays unknown", async () => {
  const fixture = await runtimeFixture();
  fixture.fabric.invokeAs = (principal, target, input, options) => {
    fixture.fabric.calls.push({ principal, target, input, options });
    const blockedUntil = Date.now() + 30;
    while (Date.now() < blockedUntil) {}
    return { ok: true, output: scout(), result: { ok: true }, receipt: { schemaVersion: 1, invocationId: "sync-late-success", revision: 1, state: "succeeded", traceId: "trace-sync-late", spanId: "span-sync-late", target, requestedAt: 1, effectsMayHaveOccurred: false, childInvocationIds: [], externalAudit: "not_configured" } };
  };
  fixture.runtime = createPlanChangeRuntime({ runtimeRoot: fixture.runtimeRoot, repositoryRoot: fixture.repositoryRoot, catalog, capabilityPort: fixture.port, dispatchTimeoutMs: 1, dispatchGraceMs: 1 });
  try {
    const result = await fixture.runtime.start({ requestId: "req-sync-late", task: "plan" }, "run-sync-late");
    assert.equal(result.status, "outcome_unknown");
    const inspection = await fixture.runtime.inspect("run-sync-late");
    const dispatchResult = inspection.events.find((event) => event.type === "capability.dispatch_result");
    assert.equal(dispatchResult.data.status, "outcome_unknown");
    assert.equal(dispatchResult.data.receipt, undefined);
    assert.equal(inspection.uncertainInvocation, true);
  } finally { await clean(fixture.repositoryRoot); }
});

test("late terminal settlement after the deadline cannot become success", async () => {
  const fixture = await runtimeFixture();
  fixture.fabric.invokeAs = async (principal, target, input, options) => {
    fixture.fabric.calls.push({ principal, target, input, options });
    await new Promise((resolve) => setTimeout(resolve, 40));
    return { ok: true, output: scout(), result: { ok: true }, receipt: { schemaVersion: 1, invocationId: "late-success", revision: 1, state: "succeeded", traceId: "trace-late", spanId: "span-late", target, requestedAt: 1, effectsMayHaveOccurred: false, childInvocationIds: [], externalAudit: "not_configured" } };
  };
  fixture.runtime = createPlanChangeRuntime({ runtimeRoot: fixture.runtimeRoot, repositoryRoot: fixture.repositoryRoot, catalog, capabilityPort: fixture.port, dispatchTimeoutMs: 5, dispatchGraceMs: 1 });
  try {
    const result = await fixture.runtime.start({ requestId: "req-late", task: "plan" }, "run-late");
    assert.equal(result.status, "outcome_unknown");
    const inspection = await fixture.runtime.inspect("run-late");
    assert.equal(inspection.events.find((event) => event.type === "capability.dispatch_result").data.receipt, undefined);
    assert.notEqual(inspection.run.status, "succeeded");
  } finally { await clean(fixture.repositoryRoot); }
});

test("runtime-owned output rejection retains the canonical invocation receipt", async () => {
  const fixture = await runtimeFixture("bad-output");
  try {
    const result = await fixture.runtime.start({ requestId: "req-output", task: "plan" }, "run-output");
    assert.equal(result.status, "failed");
    const inspection = await fixture.runtime.inspect("run-output");
    assert.equal(inspection.valid, true);
    assert.equal(inspection.events.find((event) => event.type === "capability.dispatch_result").data.receipt.state, "succeeded");
  } finally { await clean(fixture.repositoryRoot); }
});

test("local snapshot dependency failure is durably failed and abandonable", async () => {
  const fixture = await runtimeFixture();
  const original = fixture.fabric.invokeAs;
  fixture.fabric.invokeAs = async (...args) => {
    const result = await original.apply(fixture.fabric, args);
    if (args[1] === "pi_dev.scout") await exec("mkfifo", [join(fixture.repositoryRoot, "dependency.pipe")]);
    return result;
  };
  try {
    const result = await fixture.runtime.start({ requestId: "req-local-failure", task: "plan" }, "run-local-failure");
    assert.equal(result.status, "failed");
    const inspection = await fixture.runtime.inspect("run-local-failure");
    assert.equal(inspection.run.status, "failed");
    assert.ok(inspection.events.some((event) => event.type === "phase.result" && event.data.diagnosticCodes.includes("runtime.local-failure")));
    const abandoned = await fixture.runtime.abandon("run-local-failure", "operator");
    assert.equal(abandoned.run.status, "abandoned");
  } finally { await clean(fixture.repositoryRoot); }
});

test("mutation after scout prevents architect dispatch", async () => {
  const fixture = await runtimeFixture();
  fixture.fabric.invokeAs = async (principal, target, input, options) => {
    fixture.fabric.calls.push({ principal, target, input, options });
    if (target === "pi_dev.scout") await writeFile(join(fixture.repositoryRoot, "ignored-output.txt"), "mutation");
    return { ok: true, output: target === "pi_dev.scout" ? scout() : architect(), result: { ok: true }, receipt: { schemaVersion: 1, invocationId: `mutation-${fixture.fabric.calls.length}`, revision: 1, state: "succeeded", traceId: "trace", spanId: "span", target, requestedAt: 1, effectsMayHaveOccurred: false, childInvocationIds: [], externalAudit: "not_configured" } };
  };
  try {
    const result = await fixture.runtime.start({ requestId: "req-mutation", task: "plan" }, "run-mutation");
    assert.equal(result.status, "failed");
    assert.deepEqual(fixture.fabric.calls.map((call) => call.target), ["pi_dev.scout"]);
  } finally { await clean(fixture.repositoryRoot); }
});

test("Git metadata mutation after scout prevents architect dispatch", async () => {
  const fixture = await runtimeFixture();
  fixture.fabric.invokeAs = async (principal, target, input, options) => {
    fixture.fabric.calls.push({ principal, target, input, options });
    if (target === "pi_dev.scout") await writeFile(join(fixture.repositoryRoot, ".git", "factory-mutation"), "mutation");
    return { ok: true, output: target === "pi_dev.scout" ? scout() : architect(), result: { ok: true }, receipt: { schemaVersion: 1, invocationId: `git-mutation-${fixture.fabric.calls.length}`, revision: 1, state: "succeeded", traceId: "trace", spanId: "span", target, requestedAt: 1, effectsMayHaveOccurred: false, childInvocationIds: [], externalAudit: "not_configured" } };
  };
  try {
    const result = await fixture.runtime.start({ requestId: "req-git-mutation", task: "plan" }, "run-git-mutation");
    assert.equal(result.status, "failed");
    assert.deepEqual(fixture.fabric.calls.map((call) => call.target), ["pi_dev.scout"]);
  } finally { await clean(fixture.repositoryRoot); }
});

test("inspection rejects corruption and runtime records remain bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "factory-runtime-store-"));
  try {
    const store = new RuntimeRepository(root, "corrupt");
    await store.create({ id: "corrupt", workUnitId: "request", workflowId: "plan-change", status: "running", currentPhaseId: "scout" });
    await writeFile(join(root, "corrupt", "journal.jsonl"), '{"seq":2,"type":"bad"}\n');
    const inspection = await store.inspect();
    assert.equal(inspection.valid, false);
    assert.ok(inspection.diagnostics.some((item) => item.code === "runtime.journal-corrupt"));
    await assert.rejects(() => store.append("x".repeat(65), {}), /event type is invalid/);
  } finally { await clean(root); }
});

test("schema v1 records omit statusDigest and reject stale records", async () => {
  const fixture = await runtimeFixture();
  try {
    const result = await fixture.runtime.start({ requestId: "req-schema", task: "plan" }, "run-schema");
    assert.equal(result.status, "accepted");
    const runPath = join(fixture.runtimeRoot, "run-schema", "run.json");
    const current = JSON.parse(await readFile(runPath, "utf8"));
    assert.deepEqual(Object.keys(current.repositoryIdentity).sort(), ["filesDigest", "head"]);
    current.repositoryIdentity.statusDigest = current.repositoryIdentity.filesDigest;
    await writeFile(runPath, `${JSON.stringify(current)}\n`);
    const inspection = await fixture.runtime.inspect("run-schema");
    assert.equal(inspection.valid, false);
    assert.ok(inspection.diagnostics.some((item) => item.code === "runtime.run-corrupt"));
  } finally { await clean(fixture.repositoryRoot); }
});

test("runtime topology rejects equal, ancestor, and outside roots", async () => {
  const fixture = await runtimeFixture(); const outside = await mkdtemp(join(tmpdir(), "factory-outside-"));
  try {
    for (const runtimeRoot of [fixture.repositoryRoot, join(fixture.repositoryRoot, ".."), join(outside, "runtime")]) {
      const runtime = createPlanChangeRuntime({ runtimeRoot, repositoryRoot: fixture.repositoryRoot, catalog, capabilityPort: createPiProtocolCapabilityPort(fakeFabric()) });
      await assert.rejects(() => runtime.start({ requestId: "topology", task: "task" }, "topology"), /runtimeRoot|topology/);
    }
  } finally { await clean(fixture.repositoryRoot); await clean(outside); }
});

test("hostile fulfilled capability values settle durable unknown without leakage", async () => {
  const cases = [
    () => null,
    () => ({ status: "succeeded", output: (() => { const value = {}; value.self = value; return value; })() }),
    () => { const value = {}; Object.defineProperty(value, "status", { get() { throw new Error("secret getter"); } }); return value; },
    () => ({ status: "failed", diagnostics: [null] }),
  ];
  for (const [index, makeValue] of cases.entries()) {
    const fixture = await runtimeFixture(); fixture.fabric.invokeAs = async () => makeValue();
    try {
      const result = await fixture.runtime.start({ requestId: `malformed-${index}`, task: "secret task" }, `malformed-${index}`);
      assert.equal(result.status, "outcome_unknown");
      const inspection = await fixture.runtime.inspect(`malformed-${index}`);
      assert.equal(inspection.run.executionStatus, "outcome_unknown");
      assert.doesNotMatch(await readFile(join(fixture.runtimeRoot, `malformed-${index}`, "journal.jsonl"), "utf8"), /secret getter|secret task/);
    } finally { await clean(fixture.repositoryRoot); }
  }
});

test("journal swap cannot redirect append to an external victim", async () => {
  const root = await mkdtemp(join(tmpdir(), "factory-journal-swap-")); const victim = join(root, "victim"); const journal = join(root, "swap", "journal.jsonl");
  try {
    await writeFile(victim, "untouched\n"); const store = new RuntimeRepository(root, "swap"); await store.create({ id: "swap", workUnitId: "request", workflowId: "plan-change", status: "running", currentPhaseId: "scout" }); await store.release();
    await rm(journal); await symlink(victim, journal);
    await assert.rejects(() => store.append("phase.entered", { phaseId: "scout" }));
    assert.equal(await readFile(victim, "utf8"), "untouched\n");
  } finally { await clean(root); }
});

test("atomic lock publication leaves no visible partial owner and supports conservative recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "factory-lock-publication-"));
  try {
    const initial = new RuntimeRepository(root, "atomic-lock");
    await initial.create({ id: "atomic-lock", workUnitId: "request", workflowId: "plan-change", status: "running", currentPhaseId: "scout" });
    await initial.release();
    const runRoot = join(root, "atomic-lock"); const lock = join(runRoot, "execution.lock");
    const interrupted = new RuntimeRepository(root, "atomic-lock", { beforeLockPublication: () => { throw new Error("simulated interruption before publication"); } });
    await assert.rejects(() => interrupted.claimExisting(), /simulated interruption/);
    await assert.rejects(() => access(lock), { code: "ENOENT" });
    const recovered = new RuntimeRepository(root, "atomic-lock"); await recovered.claimExisting();
    const owner = JSON.parse(await readFile(lock, "utf8")); assert.deepEqual(Object.keys(owner).sort(), ["createdAt", "hostname", "pid", "processToken"]);
    await writeFile(lock, JSON.stringify({ ...owner, processToken: "replacement" }), { mode: 0o600 });
    await assert.rejects(() => recovered.release(), /not owned by this runtime/);
    assert.equal(JSON.parse(await readFile(lock, "utf8")).processToken, "replacement"); await rm(lock);
  } finally { await clean(root); }
});

test("dead same-host lock owner can be fenced, live owners block, and unsafe runtime modes are rejected", async () => {
  const fixture = await runtimeFixture("unknown");
  try {
    await fixture.runtime.start({ requestId: "dead-lock", task: "task" }, "run-dead-lock");
    const runRoot = join(fixture.runtimeRoot, "run-dead-lock"); const lock = join(runRoot, "execution.lock");
    const owner = (pid, processToken) => JSON.stringify({ hostname: hostname(), pid, processToken, createdAt: new Date().toISOString() });
    await writeFile(lock, owner(process.pid, "live"), { mode: 0o600 });
    await assert.rejects(() => fixture.runtime.abandon("run-dead-lock", "operator"), /live or unverifiable/);
    await writeFile(lock, owner(999999999, "dead"), { mode: 0o600 });
    const abandoned = await fixture.runtime.abandon("run-dead-lock", "operator"); assert.equal(abandoned.run.status, "abandoned");
    await chmod(fixture.runtimeRoot, 0o755); assert.equal((await fixture.runtime.inspect("run-dead-lock")).valid, false);
  } finally { await clean(fixture.repositoryRoot); }
});
