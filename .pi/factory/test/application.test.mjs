import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import {
  FactoryApplication,
  createPiProtocolCapabilityPort,
  discoverRepositoryRoot,
  loadPlanChangeCatalog,
  readRequestArgument,
  renderApplicationResult,
} from "../dist/index.js";

const exec = promisify(execFile);
const catalog = await loadPlanChangeCatalog();
const cli = join(process.cwd(), "dist", "cli.js");

async function fixture(mode = "accepted") {
  const root = await mkdtemp(join(tmpdir(), "factory-cli-repo-"));
  await exec("git", ["init", "-q", "-b", "main"], { cwd: root });
  await exec("git", ["config", "user.email", "factory@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "Factory Test"], { cwd: root });
  await writeFile(join(root, "README.md"), "fixture\n");
  await exec("git", ["add", "README.md"], { cwd: root });
  await exec("git", ["commit", "-qm", "fixture"], { cwd: root });
  const scout = { summary: "fixture", files: [{ path: "README.md", line: 1, relevance: "fixture" }], codePaths: [], findings: [], unresolvedQuestions: [], diagnostics: [], message: "complete" };
  const architect = { summary: "plan", assumptions: ["safe"], plan: [{ order: 1, action: "inspect", rationale: "bounded" }], risks: [{ risk: "drift", mitigation: "gate" }], acceptanceCriteria: ["evidence"], diagnostics: [], message: "complete" };
  const fabric = {
    calls: [],
    mintPrincipal: (id, kind) => ({ id, kind }),
    async invokeAs(principal, target, input, options) {
      this.calls.push({ principal, target, input, options });
      const receipt = { schemaVersion: 1, invocationId: `fixture-${this.calls.length}`, revision: 1, state: mode === "unknown" ? "outcome_unknown" : "succeeded", traceId: "trace", spanId: "span", target, requestedAt: 1, effectsMayHaveOccurred: mode === "unknown", childInvocationIds: [], externalAudit: "not_configured" };
      if (mode === "unknown") return { ok: false, error: { code: "OUTCOME_UNKNOWN", message: "interrupted" }, result: { ok: false }, receipt };
      return { ok: true, output: target === "pi_dev.scout" ? scout : mode === "rejected" ? { ...architect, assumptions: [], plan: [], risks: [], acceptanceCriteria: [] } : architect, result: { ok: true }, receipt };
    },
  };
  const capabilityPort = createPiProtocolCapabilityPort(fabric);
  const application = new FactoryApplication({ catalog, repositoryRoot: root, cwd: root, capabilityPort });
  return { root, application, fabric };
}

async function cleanup(root) { await rm(root, { recursive: true, force: true }); }

test("injected application executes scout then architect from literal and file requests", async () => {
  const first = await fixture();
  try {
    const literal = await first.application.runPlanChange("literal request");
    assert.equal(literal.exitCode, 0);
    assert.equal(literal.data.status, "accepted");
    assert.deepEqual(first.fabric.calls.map((call) => call.target), ["pi_dev.scout", "pi_dev.architect"]);
    const file = join(first.root, "request.txt");
    await writeFile(file, "file request\n");
    const second = await first.application.runPlanChange("request.txt");
    assert.equal(second.data.source, "file");
    assert.equal(second.exitCode, 0);
    assert.deepEqual(first.fabric.calls.map((call) => call.input.task), ["literal request", "literal request", "file request\n", "file request"]);
  } finally { await cleanup(first.root); }
});

test("request files are bounded, repository-contained, no-follow, and fatal UTF-8", async () => {
  const fixtureRun = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "factory-cli-outside-"));
  try {
    await writeFile(join(fixtureRun.root, "request.txt"), "utf8 request");
    assert.deepEqual(await readRequestArgument("request.txt", fixtureRun.root, fixtureRun.root), { task: "utf8 request", source: "file", path: "request.txt" });
    await writeFile(join(outside, "outside.txt"), "outside");
    await assert.rejects(() => readRequestArgument(join(outside, "outside.txt"), fixtureRun.root, fixtureRun.root), /inside the repository/);
    await symlink(join(fixtureRun.root, "request.txt"), join(fixtureRun.root, "request-link.txt"));
    await assert.rejects(() => readRequestArgument("request-link.txt", fixtureRun.root, fixtureRun.root), /symlink/);
    await writeFile(join(fixtureRun.root, "large.txt"), "x".repeat(65_537));
    await assert.rejects(() => readRequestArgument("large.txt", fixtureRun.root, fixtureRun.root), /exceeds/);
    await writeFile(join(fixtureRun.root, "invalid.txt"), Buffer.from([0xc3, 0x28]));
    await assert.rejects(() => readRequestArgument("invalid.txt", fixtureRun.root, fixtureRun.root), /encoding|UTF-8|decode/i);
  } finally { await cleanup(fixtureRun.root); await cleanup(outside); }
});

test("human and JSON renderers expose the same application decision", async () => {
  const fixtureRun = await fixture();
  try {
    const result = await fixtureRun.application.runPlanChange("same decision");
    const json = JSON.parse(renderApplicationResult(result, true));
    const human = renderApplicationResult(result);
    assert.equal(json.exitCode, result.exitCode);
    assert.equal(json.data.status, result.data.status);
    assert.match(human, new RegExp(`run ${result.data.runId}: accepted`));
  } finally { await cleanup(fixtureRun.root); }
});

test("rejected and unknown inspect results retain distinct stable exit codes", async () => {
  for (const [mode, expected, exitCode] of [["rejected", "rejected", 4], ["unknown", "outcome_unknown", 5]]) {
    const fixtureRun = await fixture(mode);
    try {
      const result = await fixtureRun.application.runPlanChange("inspect me");
      assert.equal(result.data.status, expected);
      assert.equal(result.exitCode, exitCode);
      const inspected = await fixtureRun.application.inspectRun(result.data.runId);
      assert.equal(inspected.exitCode, exitCode);
      assert.equal(inspected.data.runId, result.data.runId);
    } finally { await cleanup(fixtureRun.root); }
  }
});

test("abandon is a thin fixed-identity operator action and preserves unknown outcomes", async () => {
  const fixtureRun = await fixture("unknown");
  try {
    const started = await fixtureRun.application.runPlanChange("abandon me");
    const abandoned = await fixtureRun.application.abandonRun(started.data.runId);
    assert.equal(abandoned.data.run.status, "abandoned");
    assert.equal(abandoned.data.uncertainInvocation, true);
    assert.equal(abandoned.data.events.at(-1).type, "operator.abandon");
    assert.equal(abandoned.data.events.at(-1).data.operator, "operator:factory-cli");
  } finally { await cleanup(fixtureRun.root); }
});

test("metadata commands and standalone provider blocker need no live Pi state", async () => {
  const root = await mkdtemp(join(tmpdir(), "factory-cli-home-"));
  try {
    const show = await exec(process.execPath, [cli, "workflow", "show", "plan-change", "--format", "mermaid"], { cwd: root, env: { ...process.env, HOME: root } });
    assert.match(show.stdout, /flowchart TD/);
    const graphJson = await exec(process.execPath, [cli, "workflow", "show", "plan-change", "--format", "json"], { cwd: root, env: { ...process.env, HOME: root } });
    assert.equal(JSON.parse(graphJson.stdout).workflow.id, "plan-change");
    const validate = await exec(process.execPath, [cli, "workflow", "validate", "plan-change", "--json"], { cwd: root, env: { ...process.env, HOME: root } });
    assert.equal(JSON.parse(validate.stdout).exitCode, 0);
    const repository = await fixture();
    try {
      const before = await readFile(join(repository.root, "README.md"), "utf8");
      await assert.rejects(() => exec(process.execPath, [cli, "run", "plan-change", "--request", "text", "--json"], { cwd: repository.root, env: { ...process.env, HOME: root } }), (error) => error.code === 3 && /Pi Protocol v4\.0\.0/.test(error.stdout));
      assert.equal(await readFile(join(repository.root, "README.md"), "utf8"), before);
    } finally { await cleanup(repository.root); }
  } finally { await cleanup(root); }
});

test("Git discovery ignores hostile inherited Git variables", async () => {
  const fixtureRun = await fixture();
  const original = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  try {
    process.env.GIT_DIR = "/tmp/hostile-git-dir";
    process.env.GIT_WORK_TREE = "/tmp/hostile-work-tree";
    assert.equal(await discoverRepositoryRoot(fixtureRun.root), fixtureRun.root);
  } finally {
    if (original.GIT_DIR === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = original.GIT_DIR;
    if (original.GIT_WORK_TREE === undefined) delete process.env.GIT_WORK_TREE; else process.env.GIT_WORK_TREE = original.GIT_WORK_TREE;
    await cleanup(fixtureRun.root);
  }
});

test("format-json failures retain diagnostics and run failures retain their preallocated id", async () => {
  const invalidCatalog = { workflow: { ...catalog.workflow, id: "invalid id" }, assets: catalog.assets };
  const failedShow = await new FactoryApplication({ catalog: invalidCatalog }).showWorkflow("json");
  const renderedFailure = JSON.parse(renderApplicationResult(failedShow, false, true));
  assert.equal(renderedFailure.ok, false);
  assert.ok(renderedFailure.diagnostics.length > 0);
  const outside = await mkdtemp(join(tmpdir(), "factory-not-repo-"));
  try {
    const result = await new FactoryApplication({ cwd: outside }).runPlanChange("request");
    assert.match(result.data.runId, /^[0-9a-f-]{36}$/);
    assert.ok(result.diagnostics.length > 0);
  } finally { await cleanup(outside); }
});

test("CLI rejects unsafe request and run arguments", async () => {
  const fixtureRun = await fixture();
  try {
    const result = await exec(process.execPath, [cli, "run", "plan-change", "--request", ".", "--json"], { cwd: fixtureRun.root }).catch((error) => error);
    assert.equal(result.code, 3);
    assert.match(result.stdout, /directory/);
    const malformed = await exec(process.execPath, [cli, "inspect", "../escape", "--json"], { cwd: fixtureRun.root }).catch((error) => error);
    assert.equal(malformed.code, 2);
    assert.match(malformed.stdout, /unsafe path/);
  } finally { await cleanup(fixtureRun.root); }
});
