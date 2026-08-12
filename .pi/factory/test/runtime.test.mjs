import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostname, tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { createPlanChangeRuntime, loadPlanChangeCatalog, RuntimeRepository } from "../dist/index.js";

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

function fakePort(mode = "accepted") {
  const calls = [];
  return {
    calls,
    async dispatch(target, invocation) {
      calls.push({ target, invocation });
      if (mode === "failed") return { status: "failed", diagnostics: [{ code: "fake.failure", message: "declined", severity: "error" }] };
      if (mode === "unknown") return { status: "outcome_unknown", diagnostics: [{ code: "fake.unknown", message: "interrupted", severity: "error" }] };
      return {
        status: "succeeded",
        output: target === "pi_dev.scout" ? scout() : architect({ complete: mode !== "rejected" }),
        receipt: { schemaVersion: 1, invocationId: `fake-${calls.length}`, revision: 1, state: "succeeded", traceId: `trace-${calls.length}`, spanId: `span-${calls.length}`, target, requestedAt: 1, effectsMayHaveOccurred: false, childInvocationIds: [], externalAudit: "not_configured" },
      };
    },
  };
}

async function runtimeFixture(mode = "accepted") {
  const repositoryRoot = await repositoryFixture();
  const runtimeRoot = join(repositoryRoot, ".pi", "factory", "runtime");
  const port = fakePort(mode);
  const runtime = createPlanChangeRuntime({ runtimeRoot, repositoryRoot, catalog, capabilityPort: port });
  return { repositoryRoot, runtimeRoot, runtime, port };
}

async function clean(root) {
  await rm(root, { recursive: true, force: true });
}

test("accepted execution is sequential, receipt-backed, bounded, and mutation-free", async () => {
  const fixture = await runtimeFixture();
  try {
    const result = await fixture.runtime.start({ requestId: "req-accepted", task: "plan safely" }, "run-accepted");
    assert.equal(result.status, "accepted");
    assert.deepEqual(fixture.port.calls.map((call) => call.target), ["pi_dev.scout", "pi_dev.architect"]);
    assert.equal(fixture.port.calls[0].invocation.input.task, "plan safely");
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
  for (const mode of ["failed", "unknown"]) {
    const fixture = await runtimeFixture(mode);
    try {
      const result = await fixture.runtime.start({ requestId: `req-${mode}`, task: "plan" }, `run-${mode}`);
      assert.equal(result.status, mode === "unknown" ? "outcome_unknown" : "failed");
      assert.equal(fixture.port.calls.length, 1);
      const inspection = await fixture.runtime.inspect(`run-${mode}`);
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
  fixture.port.dispatch = async () => { throw new Error("transport interrupted"); };
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
    assert.equal(fixture.port.calls.length, 1);
  } finally { await clean(fixture.repositoryRoot); }
});

test("dispatch timeout becomes unknown and ignores a late settlement", async () => {
  const fixture = await runtimeFixture();
  fixture.runtime = createPlanChangeRuntime({ runtimeRoot: fixture.runtimeRoot, repositoryRoot: fixture.repositoryRoot, catalog, capabilityPort: { calls: fixture.port.calls, async dispatch(target, invocation) { fixture.port.calls.push({ target, invocation }); await new Promise((resolve) => setTimeout(resolve, 40)); return { status: "outcome_unknown", diagnostics: [] }; } }, dispatchTimeoutMs: 5, dispatchGraceMs: 1 });
  try {
    const result = await fixture.runtime.start({ requestId: "req-timeout", task: "plan" }, "run-timeout");
    assert.equal(result.status, "outcome_unknown");
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal((await fixture.runtime.inspect("run-timeout")).uncertainInvocation, true);
    assert.equal(fixture.port.calls.length, 1);
  } finally { await clean(fixture.repositoryRoot); }
});

test("mutation after scout prevents architect dispatch", async () => {
  const fixture = await runtimeFixture();
  fixture.port.dispatch = async (target, invocation) => {
    fixture.port.calls.push({ target, invocation });
    if (target === "pi_dev.scout") await writeFile(join(fixture.repositoryRoot, "ignored-output.txt"), "mutation");
    return { status: "succeeded", output: target === "pi_dev.scout" ? scout() : architect(), receipt: { schemaVersion: 1, invocationId: `mutation-${fixture.port.calls.length}`, revision: 1, state: "succeeded", traceId: "trace", spanId: "span", target, requestedAt: 1, effectsMayHaveOccurred: false, childInvocationIds: [], externalAudit: "not_configured" } };
  };
  try {
    const result = await fixture.runtime.start({ requestId: "req-mutation", task: "plan" }, "run-mutation");
    assert.equal(result.status, "failed");
    assert.deepEqual(fixture.port.calls.map((call) => call.target), ["pi_dev.scout"]);
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

test("runtime topology rejects equal, ancestor, and outside roots", async () => {
  const fixture = await runtimeFixture(); const outside = await mkdtemp(join(tmpdir(), "factory-outside-"));
  try {
    for (const runtimeRoot of [fixture.repositoryRoot, join(fixture.repositoryRoot, ".."), join(outside, "runtime")]) {
      const runtime = createPlanChangeRuntime({ runtimeRoot, repositoryRoot: fixture.repositoryRoot, catalog, capabilityPort: fakePort() });
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
    const fixture = await runtimeFixture(); fixture.port.dispatch = async () => makeValue();
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
