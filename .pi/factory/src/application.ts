import { constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, open, realpath } from "node:fs/promises";
import { join, relative, resolve, sep, dirname } from "node:path";
import { promisify } from "node:util";
import type { CapabilityPort, Diagnostic, FactoryRun } from "./contracts.js";
import { loadPlanChangeCatalog, type LoadedWorkflowCatalog } from "./catalog.js";
import { createUnavailableCapabilityPort, loadProductionCapabilityPort, providerHostUnavailableDiagnostic } from "./production.js";
import { createPlanChangeRuntime, type RuntimeInspection, type RuntimeExecution } from "./runtime.js";
import { normalizeWorkflow, renderWorkflowMermaid, renderWorkflowText, validateWorkflow } from "./workflow.js";
import { isCanonicalPathInside, safeGitEnvironment } from "./environment.js";

export const CLI_LIMITS = { maxRequestBytes: 65_536, maxRunIdChars: 128 } as const;
export const EXIT_CODES = { success: 0, usage: 2, failure: 3, rejected: 4, outcomeUnknown: 5 } as const;

export type ApplicationCommand = "workflow show" | "workflow validate" | "run" | "inspect" | "abandon";
export type WorkflowView = "text" | "mermaid" | "json";

export interface ApplicationResult {
  readonly command: ApplicationCommand;
  readonly ok: boolean;
  readonly exitCode: number;
  readonly data: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly Diagnostic[];
}

export interface FactoryApplicationOptions {
  readonly catalog?: LoadedWorkflowCatalog;
  readonly repositoryRoot?: string;
  /** Host composition seam. The standalone CLI intentionally leaves this unset. */
  readonly capabilityPort?: CapabilityPort;
  readonly cwd?: string;
}

export interface RequestSource { readonly task: string; readonly source: "literal" | "file"; readonly path?: string; }

const execFileAsync = promisify(execFile);
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function diagnostic(code: string, message: string, severity: Diagnostic["severity"] = "error"): Diagnostic {
  return { code, message, severity };
}
function failure(command: ApplicationCommand, code: string, message: string, exitCode: number = EXIT_CODES.failure, data: Readonly<Record<string, unknown>> = {}): ApplicationResult {
  return { command, ok: false, exitCode, data, diagnostics: [diagnostic(code, message)] };
}
function success(command: ApplicationCommand, data: Readonly<Record<string, unknown>>): ApplicationResult {
  return { command, ok: true, exitCode: EXIT_CODES.success, data, diagnostics: [] };
}
function withDiagnostics(command: ApplicationCommand, data: Readonly<Record<string, unknown>>, diagnostics: readonly Diagnostic[], exitCode: number): ApplicationResult {
  return { command, ok: exitCode === EXIT_CODES.success, exitCode, data, diagnostics };
}
function isInside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !child.startsWith("/"));
}
async function rejectSymlinkComponents(path: string): Promise<void> {
  const absolute = resolve(path);
  const parts = absolute.split(sep);
  let current = parts[0] || sep;
  for (const part of parts.slice(1)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Path is a symlink: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      break;
    }
  }
}

export async function discoverRepositoryRoot(cwd = process.cwd()): Promise<string> {
  const canonicalCwd = await realpath(cwd);
  const result = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: canonicalCwd, env: safeGitEnvironment(), timeout: 5_000, maxBuffer: 64 * 1024, encoding: "utf8" });
  const candidate = String(result.stdout).trim();
  if (candidate.length === 0) throw new Error("Current directory is not inside a git repository");
  const root = await realpath(candidate);
  const stat = await lstat(root);
  if (!stat.isDirectory()) throw new Error("Git repository root is not a directory");
  if (!isCanonicalPathInside(root, canonicalCwd)) throw new Error("Current directory is not inside the discovered repository root");
  return root;
}

export async function readRequestArgument(argument: string, repositoryRoot: string, cwd = process.cwd()): Promise<RequestSource> {
  if (typeof argument !== "string" || argument.length === 0) throw new TypeError("--request needs non-empty text or a file path");
  const root = await realpath(repositoryRoot);
  const candidate = resolve(cwd, argument);
  let item;
  try { item = await lstat(candidate); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { task: argument, source: "literal" };
    throw error;
  }
  if (item.isSymbolicLink()) throw new Error("Request path is a symlink; pass literal text instead");
  if (item.isDirectory()) throw new Error("Request path is a directory; pass a regular file or literal text");
  if (!item.isFile()) throw new Error("Request path is not a regular file");
  await rejectSymlinkComponents(candidate);
  const file = await realpath(candidate);
  const canonicalRoot = await realpath(root);
  const canonicalParentBefore = await realpath(dirname(candidate));
  if (!isCanonicalPathInside(canonicalRoot, canonicalParentBefore) || !isInside(canonicalRoot, file) || file === canonicalRoot) throw new Error("Request file must be a regular file inside the repository");
  if (item.size > CLI_LIMITS.maxRequestBytes) throw new RangeError(`Request file exceeds ${CLI_LIMITS.maxRequestBytes} bytes`);
  if (fsConstants.O_NOFOLLOW === undefined) throw new Error("No-follow file opening is unavailable");
  const beforeStat = item;
  const handle = await open(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || openedStat.dev !== beforeStat.dev || openedStat.ino !== beforeStat.ino) throw new Error("Request file identity changed while opening");
    const bytes = new Uint8Array(CLI_LIMITS.maxRequestBytes + 1);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > CLI_LIMITS.maxRequestBytes) throw new RangeError(`Request file exceeds ${CLI_LIMITS.maxRequestBytes} bytes`);
    const afterStat = await handle.stat();
    if (!afterStat.isFile() || afterStat.dev !== openedStat.dev || afterStat.ino !== openedStat.ino || afterStat.size !== offset || afterStat.size !== beforeStat.size) throw new Error("Request file changed while reading");
    const canonicalParentAfter = await realpath(dirname(candidate));
    if (canonicalParentAfter !== canonicalParentBefore || !isCanonicalPathInside(canonicalRoot, canonicalParentAfter) || !isCanonicalPathInside(canonicalRoot, file)) throw new Error("Request file containment changed while reading");
    return { task: UTF8.decode(bytes.subarray(0, offset)), source: "file", path: relative(canonicalRoot, file).replaceAll(sep, "/") };
  } finally { await handle.close(); }
}

function workflowData(catalog: LoadedWorkflowCatalog, format: WorkflowView): Readonly<Record<string, unknown>> {
  const normalized = normalizeWorkflow(catalog.workflow, catalog.assets);
  const rendered = format === "mermaid" ? renderWorkflowMermaid(normalized) : renderWorkflowText(normalized);
  return {
    workflow: normalized.workflow,
    workflowDigest: normalized.digest,
    format,
    ...(format === "json" ? {} : { rendered }),
    promptAssets: normalized.promptAssets.map((asset) => ({ path: asset.path, bytes: Buffer.from(asset.bytesBase64, "base64").byteLength })),
  };
}
function diagnosticsFrom(error: unknown, code = "application.failure"): Diagnostic[] {
  return [diagnostic(code, error instanceof Error ? error.message : "Application operation failed")];
}
function runExitCode(status: RuntimeExecution["status"]): number {
  return status === "accepted" ? EXIT_CODES.success : status === "rejected" ? EXIT_CODES.rejected : status === "outcome_unknown" ? EXIT_CODES.outcomeUnknown : EXIT_CODES.failure;
}
function inspectExitCode(inspection: RuntimeInspection): number {
  if (inspection.uncertainInvocation || inspection.run?.executionStatus === "outcome_unknown") return EXIT_CODES.outcomeUnknown;
  if (inspection.run?.status === "succeeded") return EXIT_CODES.success;
  if (inspection.run?.status === "rejected") return EXIT_CODES.rejected;
  if (!inspection.valid || inspection.run?.status === "failed" || inspection.run?.status === "abandoned") return EXIT_CODES.failure;
  return EXIT_CODES.outcomeUnknown;
}

export class FactoryApplication {
  private readonly catalogPromise: Promise<LoadedWorkflowCatalog>;
  private readonly cwd: string;
  constructor(private readonly options: FactoryApplicationOptions = {}) {
    this.catalogPromise = options.catalog ? Promise.resolve(options.catalog) : loadPlanChangeCatalog();
    this.cwd = options.cwd ?? process.cwd();
  }
  async showWorkflow(format: WorkflowView = "text"): Promise<ApplicationResult> {
    try {
      if (!["text", "mermaid", "json"].includes(format)) return failure("workflow show", "cli.invalid-format", "Workflow format must be text, mermaid, or json", EXIT_CODES.usage);
      return success("workflow show", workflowData(await this.catalogPromise, format));
    } catch (error) { return { ...failure("workflow show", "workflow.load-failed", "Workflow could not be loaded"), diagnostics: diagnosticsFrom(error, "workflow.load-failed") }; }
  }
  async validateWorkflow(): Promise<ApplicationResult> {
    try {
      const catalog = await this.catalogPromise;
      const normalized = normalizeWorkflow(catalog.workflow, catalog.assets);
      const result = validateWorkflow(normalized.workflow, catalog.assets);
      return withDiagnostics("workflow validate", { workflowId: normalized.workflow.id, workflowDigest: normalized.digest, valid: result.valid, diagnostics: result.diagnostics }, result.diagnostics, result.valid ? EXIT_CODES.success : EXIT_CODES.failure);
    } catch (error) { return { ...failure("workflow validate", "workflow.load-failed", "Workflow could not be loaded"), diagnostics: diagnosticsFrom(error, "workflow.load-failed") }; }
  }
  async runPlanChange(argument: string): Promise<ApplicationResult> {
    const runId = randomUUID();
    try {
      const repositoryRoot = this.options.repositoryRoot ?? await discoverRepositoryRoot(this.cwd);
      const source = await readRequestArgument(argument, repositoryRoot, this.cwd);
      const catalog = await this.catalogPromise;
      let capabilityPort = this.options.capabilityPort;
      if (!capabilityPort) {
        try { capabilityPort = loadProductionCapabilityPort(); } catch { return withDiagnostics("run", { workflowId: catalog.workflow.id, runId, source: source.source }, [providerHostUnavailableDiagnostic()], EXIT_CODES.failure); }
      }
      const runtime = createPlanChangeRuntime({ runtimeRoot: join(repositoryRoot, ".pi", "factory", "runtime"), repositoryRoot, catalog, capabilityPort });
      const execution = await runtime.start({ requestId: `cli-${randomUUID()}`, task: source.task }, runId);
      return withDiagnostics("run", { workflowId: catalog.workflow.id, runId: execution.runId, status: execution.status, source: source.source, ...(source.path ? { path: source.path } : {}), acceptance: execution.acceptance }, execution.diagnostics, runExitCode(execution.status));
    } catch (error) { return { ...failure("run", "run.failed", "Plan-change run failed", EXIT_CODES.failure, { runId }), diagnostics: diagnosticsFrom(error, "run.failed") }; }
  }
  async inspectRun(runId: string): Promise<ApplicationResult> {
    try {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) return failure("inspect", "cli.invalid-run-id", "Run id contains unsafe path characters", EXIT_CODES.usage);
      const repositoryRoot = this.options.repositoryRoot ?? await discoverRepositoryRoot(this.cwd);
      const catalog = await this.catalogPromise;
      const runtime = createPlanChangeRuntime({ runtimeRoot: join(repositoryRoot, ".pi", "factory", "runtime"), repositoryRoot, catalog, capabilityPort: this.options.capabilityPort ?? createUnavailableCapabilityPort() });
      const inspection = await runtime.inspect(runId);
      const data = { runId, valid: inspection.valid, run: inspection.run ?? null, events: inspection.events, uncertainInvocation: inspection.uncertainInvocation };
      return withDiagnostics("inspect", data, inspection.diagnostics, inspectExitCode(inspection));
    } catch (error) { return { ...failure("inspect", "inspect.failed", "Run inspection failed"), diagnostics: diagnosticsFrom(error, "inspect.failed") }; }
  }
  async abandonRun(runId: string): Promise<ApplicationResult> {
    try {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) return failure("abandon", "cli.invalid-run-id", "Run id contains unsafe path characters", EXIT_CODES.usage);
      const repositoryRoot = this.options.repositoryRoot ?? await discoverRepositoryRoot(this.cwd);
      const catalog = await this.catalogPromise;
      const runtime = createPlanChangeRuntime({ runtimeRoot: join(repositoryRoot, ".pi", "factory", "runtime"), repositoryRoot, catalog, capabilityPort: this.options.capabilityPort ?? createUnavailableCapabilityPort() });
      const inspection = await runtime.abandon(runId, "operator:factory-cli");
      return withDiagnostics("abandon", { runId, valid: inspection.valid, run: inspection.run ?? null, events: inspection.events, uncertainInvocation: inspection.uncertainInvocation }, inspection.diagnostics, inspectExitCode(inspection));
    } catch (error) { return { ...failure("abandon", "abandon.failed", "Run abandon failed"), diagnostics: diagnosticsFrom(error, "abandon.failed") }; }
  }
}

export function escapeHuman(value: unknown): string {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`);
}

export function renderApplicationResult(result: ApplicationResult, json = false, dataOnly = false): string {
  if (dataOnly) return `${JSON.stringify(result.ok ? result.data : result)}\n`;
  if (json) return `${JSON.stringify(result)}\n`;
  const lines: string[] = [];
  if (result.command === "workflow show") {
    if (typeof result.data.rendered === "string") lines.push(result.data.rendered.trimEnd());
    else lines.push(escapeHuman(JSON.stringify(result.data, null, 2)));
  } else if (result.command === "workflow validate") {
    lines.push(`workflow ${escapeHuman(result.data.workflowId)}: ${result.data.valid === true ? "valid" : "invalid"}`);
    for (const item of result.diagnostics) lines.push(`${escapeHuman(item.severity)}: ${escapeHuman(item.code)}: ${escapeHuman(item.message)}`);
  } else if (result.command === "run") {
    lines.push(`run ${escapeHuman(result.data.runId)}: ${escapeHuman(result.data.status)}`);
    for (const item of result.diagnostics) lines.push(`${escapeHuman(item.severity)}: ${escapeHuman(item.code)}: ${escapeHuman(item.message)}`);
  } else {
    const run = result.data.run as FactoryRun | null;
    lines.push(`${result.command === "abandon" ? "abandon" : "run"} ${escapeHuman(result.data.runId)}: ${escapeHuman(run?.status ?? "unavailable")}${result.data.uncertainInvocation === true ? " (outcome unknown)" : ""}`);
    if (run) lines.push(`phase: ${escapeHuman(run.currentPhaseId)}`);
    for (const item of result.diagnostics) lines.push(`${escapeHuman(item.severity)}: ${escapeHuman(item.code)}: ${escapeHuman(item.message)}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function createCliApplication(cwd = process.cwd()): Promise<FactoryApplication> {
  return new FactoryApplication({ cwd });
}