import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { link, mkdir, open, opendir, lstat, readlink, realpath, rename, rm, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { hostname as osHostname } from "node:os";
import { performance } from "node:perf_hooks";
import type {
  AcceptanceResult, ArchitectOutput, ArtifactRef, CapabilityDispatchResult, CapabilityPort, CapabilityReceiptRef,
  Diagnostic, EnvironmentIdentity, FactoryRun, GateCheck, GateReport, PhaseEnvelope, RepositoryIdentity, RunOutcome, ScoutOutput,
} from "./contracts.js";
import { formatScoutToArchitectRequest } from "./handoff.js";
import type { LoadedWorkflowCatalog } from "./catalog.js";
import { assertPlanChangeTopology, digestWorkflow } from "./workflow.js";
import { safeGitEnvironment } from "./environment.js";

export const RUNTIME_LIMITS = {
  maxJournalRecords: 256, maxJournalRecordBytes: 64 * 1024, maxRunBytes: 512 * 1024, maxArtifactBytes: 256 * 1024,
  maxArtifacts: 8, maxSnapshotFiles: 16_384, maxSnapshotBytes: 128 * 1024 * 1024, maxGitOutputBytes: 4 * 1024 * 1024,
  maxStringChars: 65_536, maxReceiptChildren: 64, maxDispatchTimeoutMs: 300_000, maxDispatchGraceMs: 5_000,
  maxManifestBytes: 16 * 1024 * 1024, maxSymlinkBytes: 16 * 1024,
} as const;

type EventType = "run.created" | "phase.entered" | "capability.dispatch_intent" | "capability.dispatch_result" | "phase.result" | "acceptance.result" | "operator.abandon";
type JournalEvent = { readonly seq: number; readonly type: EventType; readonly data: Record<string, unknown>; };

export interface RuntimeInspection { readonly valid: boolean; readonly run?: FactoryRun; readonly events: readonly JournalEvent[]; readonly diagnostics: readonly Diagnostic[]; readonly uncertainInvocation: boolean; }
export interface PlanChangeRequest { readonly requestId: string; readonly task: string; readonly constraints?: readonly string[]; readonly signal?: AbortSignal; }
export interface RuntimeExecution extends RunOutcome { readonly runId: string; }
export interface PlanChangeRuntimeOptions {
  readonly runtimeRoot: string; readonly repositoryRoot: string; readonly catalog: LoadedWorkflowCatalog; readonly capabilityPort: CapabilityPort;
  readonly now?: () => string; readonly dispatchTimeoutMs?: number; readonly dispatchGraceMs?: number;
}

function diagnostic(code: string, message: string, severity: Diagnostic["severity"] = "error", phaseId?: string): Diagnostic {
  return phaseId === undefined ? { code, message, severity } : { code, message, severity, phaseId };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function digest(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function jsonBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
function jsonDigest(value: unknown): string { return digest(JSON.stringify(value)); }
function boundedString(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${name} must be a non-empty string`);
  if (value.length > maximum) throw new RangeError(`${name} exceeds ${maximum} characters`); return value;
}
function safeRelativePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return normalized !== "" && normalized !== "." && !normalized.startsWith("/") && !normalized.split("/").includes("..") && !normalized.includes("\0");
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  const allowed = new Set(keys); for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${name} contains unsupported field ${key}`);
}
function boundedInteger(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${name} is out of bounds`); return value as number;
}
const NOFOLLOW = fsConstants.O_NOFOLLOW;
function noFollow(): number { if (NOFOLLOW === undefined) throw new Error("No-follow file opening is unavailable"); return NOFOLLOW; }
function currentUid(): number | undefined { return typeof process.getuid === "function" ? process.getuid() : undefined; }
function assertPrivateStat(item: import("node:fs").Stats, label: string, directory: boolean): void {
  if (directory ? !item.isDirectory() : !item.isFile()) throw new Error(`${label} is not a private regular ${directory ? "directory" : "file"}`);
  if (item.mode & 0o077) throw new Error(`${label} has group/world permissions`);
  const uid = currentUid(); if (uid !== undefined && item.uid !== uid) throw new Error(`${label} is not owned by the current user`);
}
async function fsyncDirectory(path: string): Promise<void> { await ensurePrivateAncestors(path); const handle = await open(path, fsConstants.O_RDONLY | noFollow()); try { const item = await handle.stat(); assertPrivateStat(item, path, true); await handle.sync(); } finally { await handle.close(); } }
async function ensureNoSymlinkComponents(path: string): Promise<void> {
  const absolute = resolve(path); const parts = absolute.split(sep); let current = parts[0] || sep;
  for (const part of parts.slice(1)) { current = join(current, part); try { const item = await lstat(current); if (item.isSymbolicLink()) throw new Error(`Runtime path contains a symlink: ${current}`); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") break; throw error; } }
}
async function ensurePrivateAncestors(path: string): Promise<void> { await ensureNoSymlinkComponents(path); }
async function requirePrivateDirectory(path: string, label: string): Promise<void> { const item = await lstat(path); if (item.isSymbolicLink()) throw new Error(`${label} is a symlink`); assertPrivateStat(item, label, true); if (await realpath(path) !== resolve(path)) throw new Error(`${label} is not a canonical private directory`); }
async function validateExistingTarget(path: string, label: string): Promise<void> {
  try { const item = await lstat(path); if (item.isSymbolicLink()) throw new Error(`${label} is a symlink`); assertPrivateStat(item, label, false); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
async function atomicWrite(path: string, content: string): Promise<void> {
  const parent = dirname(path); await ensurePrivateAncestors(parent); await mkdir(parent, { recursive: true, mode: 0o700 }); await requirePrivateDirectory(parent, "Runtime file parent"); await ensurePrivateAncestors(parent);
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`; let completed = false;
  try {
    const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow(), 0o600);
    try { const item = await handle.stat(); assertPrivateStat(item, "temporary runtime file", false); await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await ensurePrivateAncestors(parent); await validateExistingTarget(path, "runtime file"); await rename(temporary, path); completed = true; await fsyncDirectory(parent);
  } finally { if (!completed) { try { await rm(temporary, { force: true }); } catch { /* cleanup only */ } } }
}
async function boundedRead(path: string, maximumBytes: number, label: string, privateFile = true): Promise<Uint8Array> {
  const parent = dirname(path); await ensurePrivateAncestors(parent); if (privateFile) await requirePrivateDirectory(parent, `${label} parent`);
  const handle = await open(path, fsConstants.O_RDONLY | noFollow()); try {
    const item = await handle.stat(); if (privateFile) assertPrivateStat(item, label, false); else if (!item.isFile()) throw new Error(`${label} is not a regular file`); if (item.size > maximumBytes) throw new Error(`${label} exceeds ${maximumBytes} bytes`);
    const bytes = new Uint8Array(await handle.readFile()); if (bytes.byteLength > maximumBytes) throw new Error(`${label} exceeds ${maximumBytes} bytes`); await ensurePrivateAncestors(parent); return bytes;
  } finally { await handle.close(); }
}

function persistedRun(value: FactoryRun): Record<string, unknown> {
  const result: Record<string, unknown> = {
    schemaVersion: 1, id: value.id, workUnitId: value.workUnitId, workflowId: value.workflowId, status: value.status,
    currentPhaseId: value.currentPhaseId, executionStatus: value.executionStatus ?? "pending", acceptanceStatus: value.acceptanceStatus ?? "pending",
    uncertainInvocation: value.uncertainInvocation ?? false, taskDigest: value.taskDigest ?? jsonDigest({ task: "", constraints: [] }),
  };
  if (value.workflowDigest) result.workflowDigest = value.workflowDigest;
  if (value.repositoryIdentity) result.repositoryIdentity = value.repositoryIdentity;
  if (value.environmentIdentity) result.environmentIdentity = value.environmentIdentity;
  if (value.phaseEnvelopes) {
    const envelopes: Record<string, unknown> = {};
    for (const [phase, envelope] of Object.entries(value.phaseEnvelopes)) envelopes[phase] = persistedEnvelope(envelope);
    result.phaseEnvelopes = envelopes;
  }
  return result;
}
function persistedEnvelope(envelope: PhaseEnvelope): Record<string, unknown> {
  const result: Record<string, unknown> = { phaseId: envelope.phaseId, attemptId: envelope.attemptId, status: envelope.status, diagnostics: envelope.diagnostics.map((item) => ({ code: item.code, severity: item.severity, ...(item.phaseId ? { phaseId: item.phaseId } : {}) })) };
  if (envelope.receipt) result.receipt = envelope.receipt;
  if (envelope.artifacts) result.artifacts = envelope.artifacts;
  return result;
}

const RUN_KEYS = ["schemaVersion", "id", "workUnitId", "workflowId", "status", "currentPhaseId", "executionStatus", "acceptanceStatus", "uncertainInvocation", "taskDigest", "workflowDigest", "repositoryIdentity", "environmentIdentity", "phaseEnvelopes"];
const ENVELOPE_KEYS = ["phaseId", "attemptId", "status", "diagnostics", "receipt", "artifacts"];
const EVENT_KEYS: Record<EventType, readonly string[]> = {
  "run.created": ["workflowId", "workflowDigest", "repository", "environment", "requestId", "taskDigest"],
  "phase.entered": ["phaseId"], "capability.dispatch_intent": ["phaseId", "target", "attemptId", "inputDigest", "workflowDigest", "repositoryIdentityDigest", "environmentIdentityDigest"],
  "capability.dispatch_result": ["phaseId", "target", "attemptId", "status", "receipt", "diagnosticCodes"],
  "phase.result": ["phaseId", "attemptId", "status", "outputDigest", "diagnosticCodes"],
  "acceptance.result": ["accepted", "checkIds", "failedCheckIds"], "operator.abandon": ["operator"],
};

type DispatchStatus = "succeeded" | "failed" | "outcome_unknown";
function receiptStateMatches(state: unknown, expectedStatus: DispatchStatus | undefined): boolean {
  if (expectedStatus === undefined) return typeof state === "string";
  if (expectedStatus === "succeeded") return state === "succeeded";
  if (expectedStatus === "outcome_unknown") return state === "outcome_unknown";
  return state === "rejected" || state === "failed" || state === "cancelled";
}
function validateReceipt(raw: unknown, target: string, expectedStatus?: DispatchStatus): CapabilityReceiptRef | undefined {
  if (!isRecord(raw)) return undefined;
  const allowed = ["schemaVersion", "invocationId", "revision", "state", "traceId", "spanId", "parentInvocationId", "target", "registrationId", "generation", "contractDigest", "requestedAt", "startedAt", "endedAt", "durationMs", "outcomeCode", "effectsMayHaveOccurred", "childInvocationIds", "externalAudit", "projectionDigest"];
  exactKeys(raw, allowed, "receipt");
  const strings = ["invocationId", "traceId", "spanId", "target", "parentInvocationId", "registrationId", "contractDigest", "outcomeCode"];
  if (raw.schemaVersion !== 1 || typeof raw.invocationId !== "string" || typeof raw.traceId !== "string" || typeof raw.spanId !== "string" || typeof raw.target !== "string" || raw.target !== target || typeof raw.revision !== "number" || !Number.isInteger(raw.revision) || raw.revision < 0 || typeof raw.requestedAt !== "number" || !Number.isFinite(raw.requestedAt) || typeof raw.effectsMayHaveOccurred !== "boolean" || !Array.isArray(raw.childInvocationIds) || raw.childInvocationIds.length > RUNTIME_LIMITS.maxReceiptChildren || raw.childInvocationIds.some((item) => typeof item !== "string") || !["not_configured", "pending", "accepted", "queued", "failed", "dropped"].includes(raw.externalAudit as string)) return undefined;
  const states = new Set(["requested", "rejected", "started", "outcome_unknown", "succeeded", "failed", "cancelled"]);
  if (!states.has(raw.state as string) || !receiptStateMatches(raw.state, expectedStatus)) return undefined;
  for (const key of strings) if (raw[key] !== undefined && (typeof raw[key] !== "string" || raw[key].trim().length === 0 || raw[key].length > RUNTIME_LIMITS.maxStringChars)) return undefined;
  for (const child of raw.childInvocationIds) if (typeof child !== "string" || child.trim().length === 0 || child.length > RUNTIME_LIMITS.maxStringChars) return undefined;
  if (raw.projectionDigest !== undefined && (typeof raw.projectionDigest !== "string" || !/^[a-f0-9]{64}$/.test(raw.projectionDigest))) return undefined;
  for (const key of ["startedAt", "endedAt", "durationMs", "generation"]) if (raw[key] !== undefined && (typeof raw[key] !== "number" || !Number.isFinite(raw[key]))) return undefined;
  const projection: Record<string, unknown> = {}; for (const key of allowed) if (key !== "projectionDigest" && raw[key] !== undefined) projection[key] = raw[key];
  const projectionDigest = jsonDigest(projection); if (raw.projectionDigest !== undefined && raw.projectionDigest !== projectionDigest) return undefined;
  return { ...projection as Omit<CapabilityReceiptRef, "projectionDigest">, projectionDigest } as CapabilityReceiptRef;
}

function validateScout(value: unknown): value is ScoutOutput {
  if (!isRecord(value)) return false; exactKeys(value, ["summary", "files", "codePaths", "findings", "unresolvedQuestions", "diagnostics", "message"], "scout output");
  if (!["summary", "files", "codePaths", "findings", "unresolvedQuestions", "diagnostics", "message"].every((key) => key in value)) return false;
  const text = (item: unknown, max = 2_048): item is string => typeof item === "string" && item.length <= max;
  if (!text(value.summary) || !text(value.message) || !Array.isArray(value.files) || !Array.isArray(value.codePaths) || !Array.isArray(value.findings) || !Array.isArray(value.unresolvedQuestions) || !Array.isArray(value.diagnostics)) return false;
  if (value.files.length > 64 || value.codePaths.length > 64 || value.findings.length > 64 || value.unresolvedQuestions.length > 32 || value.diagnostics.length > 64) return false;
  for (const file of value.files) if (!isRecord(file) || (Object.keys(file).some((key) => !["path", "line", "relevance"].includes(key))) || !text(file.path) || !text(file.relevance) || (file.line !== undefined && (!Number.isInteger(file.line) || (file.line as number) < 1))) return false;
  for (const path of value.codePaths) if (!isRecord(path) || Object.keys(path).some((key) => !["from", "to", "relationship"].includes(key)) || !text(path.from) || !text(path.to) || !text(path.relationship)) return false;
  return [...value.findings, ...value.unresolvedQuestions, ...value.diagnostics].every((item) => text(item));
}
function validateArchitect(value: unknown): value is ArchitectOutput {
  if (!isRecord(value)) return false; exactKeys(value, ["summary", "assumptions", "plan", "risks", "acceptanceCriteria", "diagnostics", "message"], "architect output");
  const text = (item: unknown, max = 2_048): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= max;
  if (!text(value.summary) || !text(value.message) || !Array.isArray(value.assumptions) || !Array.isArray(value.plan) || !Array.isArray(value.risks) || !Array.isArray(value.acceptanceCriteria) || !Array.isArray(value.diagnostics)) return false;
  if (value.assumptions.length > 32 || value.plan.length > 64 || value.risks.length > 32 || value.acceptanceCriteria.length > 64 || value.diagnostics.length > 64 || !value.assumptions.every((x) => text(x)) || !value.acceptanceCriteria.every((x) => text(x)) || !value.diagnostics.every((x) => text(x))) return false;
  for (const [index, item] of value.plan.entries()) if (!isRecord(item) || Object.keys(item).some((key) => !["order", "action", "rationale"].includes(key)) || item.order !== index + 1 || !text(item.action) || !text(item.rationale)) return false;
  for (const item of value.risks) if (!isRecord(item) || Object.keys(item).some((key) => !["risk", "mitigation"].includes(key)) || !text(item.risk) || !text(item.mitigation)) return false;
  return true;
}
function emptyAcceptance(): AcceptanceResult { return { accepted: false, gateReports: [], diagnostics: [] }; }
function isTerminal(run: FactoryRun): boolean { return run.status === "succeeded" || run.status === "rejected" || run.status === "abandoned"; }

interface LockOwner { readonly hostname: string; readonly pid: number; readonly processToken: string; readonly createdAt: string; }
export interface RuntimeRepositoryOptions { readonly beforeLockPublication?: () => void | Promise<void>; }

export class RuntimeRepository {
  readonly runtimeRoot: string; private readonly runPath: string; private readonly journalPath: string; private readonly lockPath: string;
  private journalRecords = 0; private lockHeld = false; private readonly processToken = randomUUID();
  constructor(runtimeRoot: string, readonly runId: string, options: RuntimeRepositoryOptions = {}) {
    boundedString(runId, "runId", 128); if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new TypeError("runId contains unsafe path characters");
    this.runtimeRoot = resolve(runtimeRoot); const runRoot = join(this.runtimeRoot, runId); this.runPath = join(runRoot, "run.json"); this.journalPath = join(runRoot, "journal.jsonl"); this.lockPath = join(runRoot, "execution.lock"); this.beforeLockPublication = options.beforeLockPublication;
  }
  private readonly beforeLockPublication: (() => void | Promise<void>) | undefined;
  private async prepareRoot(): Promise<void> {
    await ensureNoSymlinkComponents(dirname(this.runtimeRoot)); await mkdir(this.runtimeRoot, { recursive: true, mode: 0o700 });
    const item = await lstat(this.runtimeRoot); if (item.isSymbolicLink()) throw new Error("Runtime root is a symlink"); assertPrivateStat(item, "Runtime root", true); await ensureNoSymlinkComponents(this.runtimeRoot);
  }
  private async verifyExistingPath(): Promise<void> {
    await ensureNoSymlinkComponents(this.runtimeRoot); const root = await lstat(this.runtimeRoot); if (root.isSymbolicLink()) throw new Error("Runtime root is a symlink"); assertPrivateStat(root, "Runtime root", true);
    await ensureNoSymlinkComponents(dirname(this.runPath)); const runRoot = await lstat(dirname(this.runPath)); if (runRoot.isSymbolicLink()) throw new Error("Run directory is a symlink"); assertPrivateStat(runRoot, "Run directory", true);
  }
  async prepare(): Promise<void> { await this.prepareRoot(); }
  private owner(): LockOwner { return { hostname: osHostname(), pid: process.pid, processToken: this.processToken, createdAt: new Date().toISOString() }; }
  private async readOwner(): Promise<LockOwner> {
    const bytes = await boundedRead(this.lockPath, 16 * 1024, "execution lock owner"); const value: unknown = JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8"));
    if (!isRecord(value)) throw new Error("Execution lock owner metadata is invalid"); exactKeys(value, ["hostname", "pid", "processToken", "createdAt"], "execution lock owner");
    const ownerPid = value.pid; if (typeof value.hostname !== "string" || value.hostname.trim().length === 0 || value.hostname.length > 256 || typeof ownerPid !== "number" || !Number.isInteger(ownerPid) || ownerPid < 1 || ownerPid > 2 ** 31 - 1 || typeof value.processToken !== "string" || value.processToken.length < 1 || value.processToken.length > 128 || typeof value.createdAt !== "string" || value.createdAt.length < 1 || value.createdAt.length > 128) throw new Error("Execution lock owner metadata is invalid");
    return { hostname: value.hostname, pid: ownerPid, processToken: value.processToken, createdAt: value.createdAt };
  }
  private async claimLock(): Promise<void> {
    const runRoot = dirname(this.runPath); await requirePrivateDirectory(runRoot, "Run directory");
    const temporary = join(runRoot, `.execution.lock.tmp-${process.pid}-${randomUUID()}`); const owner = this.owner(); let published = false;
    try {
      const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow(), 0o600);
      try { const item = await handle.stat(); assertPrivateStat(item, "temporary execution lock", false); await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
      await ensureNoSymlinkComponents(runRoot); if (this.beforeLockPublication) await this.beforeLockPublication();
      await link(temporary, this.lockPath); published = true; this.lockHeld = true; await fsyncDirectory(runRoot);
    } catch (error) {
      if (published) {
        try { await this.release(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Execution lock publication cleanup failed"); }
      }
      throw error;
    } finally { await rm(temporary, { force: true }); }
  }
  async create(run: FactoryRun): Promise<void> {
    await this.prepareRoot(); const runRoot = dirname(this.runPath);
    try { await mkdir(runRoot, { recursive: false, mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; throw new Error(`Run already exists: ${this.runId}`); }
    try {
      const item = await lstat(runRoot); assertPrivateStat(item, "Run directory", true); await fsyncDirectory(this.runtimeRoot); await this.claimLock();
      await atomicWrite(this.runPath, `${JSON.stringify(persistedRun(run))}\n`); await atomicWrite(this.journalPath, ""); this.journalRecords = 0;
      const taskDigest = run.taskDigest ?? jsonDigest({ task: "", constraints: [] });
      await this.append("run.created", { workflowId: run.workflowId, workflowDigest: run.workflowDigest ?? "", repository: run.repositoryIdentity ?? {}, environment: run.environmentIdentity ?? {}, requestId: run.workUnitId, taskDigest });
    } catch (error) { try { await this.release(); } catch { /* preserve the creation failure */ } throw error; }
  }
  async claimExisting(): Promise<void> { await this.prepareRoot(); const item = await lstat(dirname(this.runPath)); if (item.isSymbolicLink()) throw new Error("Run directory is a symlink"); assertPrivateStat(item, "Run directory", true); await this.claimLock(); }
  async claimForAbandon(): Promise<void> {
    await this.prepareRoot(); const runRoot = dirname(this.runPath); const item = await lstat(runRoot); if (item.isSymbolicLink()) throw new Error("Run directory is a symlink"); assertPrivateStat(item, "Run directory", true);
    try { await this.claimLock(); return; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lock = await lstat(this.lockPath); if (lock.isSymbolicLink()) throw new Error("Execution lock is a symlink"); assertPrivateStat(lock, "Execution lock", false);
      const owner = await this.readOwner(); if (owner.hostname !== osHostname()) throw new Error("Execution lock owner is live or unverifiable");
      try { process.kill(owner.pid, 0); } catch (probeError) {
        if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw new Error("Execution lock owner is live or unverifiable");
        const stale = `${this.lockPath}.stale-${owner.pid}-${randomUUID()}`; await ensureNoSymlinkComponents(runRoot); await rename(this.lockPath, stale); await fsyncDirectory(runRoot); await unlink(stale); await fsyncDirectory(runRoot);
        await this.claimLock(); return;
      }
      throw new Error("Execution lock owner is live or unverifiable");
    }
  }
  async release(): Promise<void> {
    if (!this.lockHeld) return; const lock = await lstat(this.lockPath); if (lock.isSymbolicLink()) throw new Error("Execution lock is a symlink"); assertPrivateStat(lock, "Execution lock", false);
    const owner = await this.readOwner(); if (owner.processToken !== this.processToken || owner.pid !== process.pid || owner.hostname !== osHostname()) throw new Error("Execution lock is not owned by this runtime");
    await unlink(this.lockPath); await fsyncDirectory(dirname(this.runPath)); this.lockHeld = false;
  }
  async writeRun(run: FactoryRun): Promise<void> { await atomicWrite(this.runPath, `${JSON.stringify(persistedRun(run))}\n`); }
  async readRun(): Promise<FactoryRun> { const bytes = await boundedRead(this.runPath, RUNTIME_LIMITS.maxRunBytes, "run.json"); const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8")); validateRun(value, this.runId); return value as FactoryRun; }
  async append(type: EventType, data: Record<string, unknown>): Promise<JournalEvent> {
    if (!Object.hasOwn(EVENT_KEYS, type)) throw new TypeError("journal event type is invalid"); const keys = EVENT_KEYS[type]; exactKeys(data, keys, `event ${type}`); if (this.journalRecords >= RUNTIME_LIMITS.maxJournalRecords) throw new RangeError("journal record limit exceeded");
    const event: JournalEvent = { seq: this.journalRecords + 1, type, data }; const line = `${JSON.stringify(event)}\n`; if (Buffer.byteLength(line) > RUNTIME_LIMITS.maxJournalRecordBytes) throw new RangeError("journal record exceeds bounded size");
    const parent = dirname(this.journalPath); await ensurePrivateAncestors(parent); await requirePrivateDirectory(parent, "Run directory"); const handle = await open(this.journalPath, fsConstants.O_WRONLY | fsConstants.O_APPEND | noFollow()); try { const item = await handle.stat(); assertPrivateStat(item, "journal.jsonl", false); if (item.size + Buffer.byteLength(line) > RUNTIME_LIMITS.maxJournalRecords * RUNTIME_LIMITS.maxJournalRecordBytes) throw new RangeError("journal byte limit exceeded"); await handle.write(line, undefined, "utf8"); await handle.sync(); this.journalRecords += 1; } finally { await handle.close(); } await ensurePrivateAncestors(parent); await fsyncDirectory(parent); return event;
  }
  async inspect(): Promise<RuntimeInspection> {
    const diagnostics: Diagnostic[] = []; let run: FactoryRun | undefined; let events: JournalEvent[] = [];
    try { await this.verifyExistingPath(); } catch (error) { diagnostics.push(diagnostic("runtime.path-corrupt", error instanceof Error ? error.message : "Runtime path is unsafe")); return { valid: false, diagnostics, events, uncertainInvocation: false }; }
    try { run = await this.readRun(); } catch (error) { diagnostics.push(diagnostic("runtime.run-corrupt", error instanceof Error ? error.message : "run.json is unreadable")); }
    try {
      const bytes = await boundedRead(this.journalPath, RUNTIME_LIMITS.maxJournalRecords * RUNTIME_LIMITS.maxJournalRecordBytes, "journal.jsonl"); const text = Buffer.from(bytes).toString("utf8"); const lines = text ? text.split("\n") : [];
      if (lines.at(-1) === "") lines.pop(); if (lines.length === 0) throw new Error("journal is empty"); if (lines.length > RUNTIME_LIMITS.maxJournalRecords) throw new Error("journal has too many records");
      events = lines.map((line, index) => parseEvent(line, index + 1)); this.journalRecords = events.length; if (run) run = reconcileEvents(events, run, diagnostics);
    } catch (error) { diagnostics.push(diagnostic("runtime.journal-corrupt", error instanceof Error ? error.message : "journal is unreadable")); }
    const uncertainInvocation = events.some((event) => event.type === "capability.dispatch_intent" && !events.some((result) => result.type === "capability.dispatch_result" && result.data.attemptId === event.data.attemptId)) || events.some((event) => event.type === "capability.dispatch_result" && event.data.status === "outcome_unknown") || Boolean(run?.uncertainInvocation);
    if (uncertainInvocation) diagnostics.push(diagnostic("runtime.outcome-unknown", "Capability dispatch outcome is unknown; replay is prohibited", "warning"));
    if (run && uncertainInvocation && !run.uncertainInvocation) run = { ...run, executionStatus: "outcome_unknown", uncertainInvocation: true };
    const valid = diagnostics.every((item) => !["runtime.run-corrupt", "runtime.journal-corrupt", "runtime.state-divergent", "runtime.path-corrupt"].includes(item.code));
    return { valid, ...(run ? { run } : {}), events, diagnostics, uncertainInvocation };
  }
  async openExisting(): Promise<RuntimeInspection> { return this.inspect(); }
}
function validateRun(value: unknown, runId: string): void {
  if (!isRecord(value)) throw new Error("run.json must be an object"); exactKeys(value, RUN_KEYS, "run.json");
  if (value.schemaVersion !== 1 || value.id !== runId || typeof value.workUnitId !== "string" || typeof value.workflowId !== "string" || typeof value.status !== "string" || typeof value.currentPhaseId !== "string" || !["pending", "running", "awaiting_capability", "awaiting_acceptance", "succeeded", "rejected", "failed", "abandoned"].includes(value.status) || !["pending", "running", "succeeded", "failed", "outcome_unknown"].includes(value.executionStatus as string) || !["pending", "accepted", "rejected"].includes(value.acceptanceStatus as string) || typeof value.uncertainInvocation !== "boolean" || typeof value.taskDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.taskDigest)) throw new Error("run.json has an invalid shape");
  if (value.workUnitId.length > 256 || value.workflowId.length > 128 || value.currentPhaseId.length > 128) throw new Error("run.json contains an oversized string");
  if (value.repositoryIdentity !== undefined) validateRepositoryIdentity(value.repositoryIdentity); if (value.environmentIdentity !== undefined) validateEnvironmentIdentity(value.environmentIdentity);
  if (value.phaseEnvelopes !== undefined) { if (!isRecord(value.phaseEnvelopes)) throw new Error("phaseEnvelopes is invalid"); if (Object.keys(value.phaseEnvelopes).length > 8) throw new Error("too many phase envelopes"); for (const item of Object.values(value.phaseEnvelopes)) validateEnvelope(item); }
}
function validateRepositoryIdentity(value: unknown): void { if (!isRecord(value)) throw new Error("repository identity is invalid"); exactKeys(value, ["head", "filesDigest"], "repository identity"); for (const key of ["head", "filesDigest"]) if (typeof value[key] !== "string" || value[key].length > 256) throw new Error("repository identity is invalid"); }
function validateEnvironmentIdentity(value: unknown): void { if (!isRecord(value)) throw new Error("environment identity is invalid"); exactKeys(value, ["nodeMajor", "platform", "arch", "ci", "digest"], "environment identity"); if (typeof value.nodeMajor !== "number" || typeof value.platform !== "string" || typeof value.arch !== "string" || typeof value.ci !== "boolean" || typeof value.digest !== "string") throw new Error("environment identity is invalid"); }
function validateEnvelope(value: unknown): void { if (!isRecord(value)) throw new Error("phase envelope is invalid"); exactKeys(value, ENVELOPE_KEYS, "phase envelope"); if (typeof value.phaseId !== "string" || typeof value.attemptId !== "string" || !["succeeded", "rejected", "failed"].includes(value.status as string) || !Array.isArray(value.diagnostics) || value.diagnostics.length > 64 || Object.keys(value).includes("output")) throw new Error("phase envelope is invalid"); if (value.receipt !== undefined) { const candidate = value.receipt; const target = isRecord(candidate) && typeof candidate.target === "string" ? candidate.target : ""; const receipt = validateReceipt(candidate, target, value.status === "succeeded" ? "succeeded" : "failed"); if (!receipt || !isRecord(candidate) || candidate.projectionDigest !== receipt.projectionDigest) throw new Error("phase receipt is invalid"); } if (value.artifacts !== undefined) { if (!Array.isArray(value.artifacts) || value.artifacts.length !== 1) throw new Error("phase artifacts are invalid"); const artifact = value.artifacts[0]; if (!isRecord(artifact)) throw new Error("phase artifact is invalid"); exactKeys(artifact, ["id", "kind", "path", "digest", "bytes"], "phase artifact"); if (artifact.kind !== "report" || artifact.path !== "artifacts/plan.json" || typeof artifact.id !== "string" || typeof artifact.digest !== "string" || !/^[a-f0-9]{64}$/.test(artifact.digest) || typeof artifact.bytes !== "number" || !Number.isInteger(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > RUNTIME_LIMITS.maxArtifactBytes || artifact.id !== `plan-${artifact.digest.slice(0, 16)}`) throw new Error("phase artifact is invalid"); } }
function parseEvent(line: string, sequence: number): JournalEvent { const value: unknown = JSON.parse(line); if (!isRecord(value)) throw new Error(`journal record ${sequence} is invalid`); exactKeys(value, ["seq", "type", "data"], `journal record ${sequence}`); if (value.seq !== sequence || typeof value.type !== "string" || !Object.hasOwn(EVENT_KEYS, value.type) || !isRecord(value.data)) throw new Error(`journal record ${sequence} is invalid`); const type = value.type as EventType; exactKeys(value.data, EVENT_KEYS[type], `event ${type}`); if (value.data.receipt !== undefined) { const receipt = validateReceipt(value.data.receipt, typeof value.data.target === "string" ? value.data.target : "", type === "capability.dispatch_result" && (value.data.status === "succeeded" || value.data.status === "failed" || value.data.status === "outcome_unknown") ? value.data.status : undefined); if (!receipt || !isRecord(value.data.receipt) || value.data.receipt.projectionDigest !== receipt.projectionDigest) throw new Error(`journal event ${type} receipt is invalid`); } if (type === "capability.dispatch_result" && value.data.status === "succeeded" && !("receipt" in value.data)) throw new Error(`journal event ${type} is missing receipt`); const required: Record<EventType, readonly string[]> = { "run.created": ["workflowId", "workflowDigest", "repository", "environment", "requestId", "taskDigest"], "phase.entered": ["phaseId"], "capability.dispatch_intent": EVENT_KEYS["capability.dispatch_intent"], "capability.dispatch_result": ["phaseId", "target", "attemptId", "status", "diagnosticCodes"], "phase.result": EVENT_KEYS["phase.result"], "acceptance.result": EVENT_KEYS["acceptance.result"], "operator.abandon": EVENT_KEYS["operator.abandon"] }; for (const key of required[type]) if (!(key in value.data)) throw new Error(`journal event ${type} is missing ${key}`); const diagnosticCodes = value.data.diagnosticCodes; if (diagnosticCodes !== undefined && (!Array.isArray(diagnosticCodes) || diagnosticCodes.some((code) => typeof code !== "string"))) throw new Error(`journal event ${type} diagnostics are invalid`); return value as JournalEvent; }
function reconcileEvents(events: readonly JournalEvent[], run: FactoryRun | undefined, diagnostics: Diagnostic[]): FactoryRun {
  if (!run) throw new Error("run projection is unavailable");
  const first = events[0]; if (!first || first.type !== "run.created") { diagnostics.push(diagnostic("runtime.state-divergent", "Run and journal do not share a valid creation prefix")); return { ...run, status: "failed", executionStatus: "outcome_unknown", uncertainInvocation: true }; }
  const created = first.data;
  const same = (left: unknown, right: unknown): boolean => { try { return jsonDigest(left) === jsonDigest(right); } catch { return false; } };
  if (created.requestId !== run.workUnitId || created.workflowId !== run.workflowId || (created.workflowDigest && created.workflowDigest !== run.workflowDigest) || created.taskDigest !== run.taskDigest || (run.repositoryIdentity && !same(created.repository, run.repositoryIdentity)) || (run.environmentIdentity && !same(created.environment, run.environmentIdentity))) diagnostics.push(diagnostic("runtime.state-divergent", "run.json identity fields diverge from the journal creation record"));
  let phase = "request"; const entered = [phase]; let activeAttempt: string | undefined; let activePhase: string | undefined; let execution: FactoryRun["executionStatus"] = "pending"; let acceptance: FactoryRun["acceptanceStatus"] = "pending"; let status: FactoryRun["status"] = "running"; let uncertain = false; let terminal = false;
  const capabilityResults = new Map<string, JournalEvent>(); const successfulAttempts = new Map<string, JournalEvent>();
  const enterable: Record<string, string[]> = { request: ["scout"], scout: ["handoff"], handoff: ["architect"], architect: ["gates"], gates: ["accepted", "rejected"] };
  const divergent = (message: string): void => { diagnostics.push(diagnostic("runtime.state-divergent", message)); };
  for (const event of events.slice(1)) {
    if (event.type === "operator.abandon") { if (terminal) divergent("Abandon follows a terminal event"); status = "abandoned"; uncertain = uncertain || run.uncertainInvocation === true || execution === "outcome_unknown"; if (uncertain) execution = "outcome_unknown"; terminal = true; continue; }
    if (terminal) { divergent("Journal contains events after terminal state"); continue; }
    if (event.type === "phase.entered") {
      const next = event.data.phaseId; if (typeof next !== "string" || !(enterable[phase] ?? []).includes(next)) { divergent("Phase entry is out of order"); continue; }
      phase = next; entered.push(next); if (next === "scout" && execution === "pending") execution = "running"; if (next === "accepted" || next === "rejected") { terminal = true; status = next === "accepted" ? "succeeded" : "rejected"; acceptance = next === "accepted" ? "accepted" : "rejected"; } continue;
    }
    if (event.type === "capability.dispatch_intent") {
      if (activeAttempt || !["scout", "architect"].includes(phase) || typeof event.data.attemptId !== "string") divergent("Capability intent is out of order");
      activeAttempt = String(event.data.attemptId); activePhase = phase; execution = "running"; continue;
    }
    if (event.type === "capability.dispatch_result") {
      if (!activeAttempt || event.data.attemptId !== activeAttempt || event.data.phaseId !== activePhase) divergent("Capability result does not match its intent");
      if (!["succeeded", "failed", "outcome_unknown"].includes(event.data.status as string)) divergent("Capability result has an invalid status");
      capabilityResults.set(String(event.data.attemptId), event); if (event.data.status === "outcome_unknown") { uncertain = true; execution = "outcome_unknown"; } else execution = event.data.status === "succeeded" ? "succeeded" : "failed"; continue;
    }
    if (event.type === "phase.result") {
      if (activeAttempt && event.data.attemptId !== activeAttempt) divergent("Phase result does not match its attempt");
      if (activeAttempt) { const result = capabilityResults.get(activeAttempt); const outputRejected = event.data.status === "failed" && result?.data.status === "succeeded" && Array.isArray(event.data.diagnosticCodes) && event.data.diagnosticCodes.includes("capability.output-bound"); if (!result || (result.data.status !== event.data.status && !outputRejected)) divergent("Phase result does not reconcile with its capability result"); if (event.data.status === "succeeded") successfulAttempts.set(activeAttempt, event); activeAttempt = undefined; activePhase = undefined; }
      if (event.data.status === "outcome_unknown") { uncertain = true; execution = "outcome_unknown"; status = "failed"; } else if (event.data.status === "failed" ) { execution = "failed"; status = "failed"; } else execution = "succeeded";
      continue;
    }
    if (event.type === "acceptance.result") { if (phase !== "gates") divergent("Acceptance result is out of order"); acceptance = event.data.accepted === true ? "accepted" : event.data.accepted === false ? "rejected" : "pending"; if (acceptance === "pending") divergent("Acceptance result is malformed"); continue; }
  }
  if (activeAttempt) { uncertain = true; execution = "outcome_unknown"; status = "failed"; diagnostics.push(diagnostic("runtime.projection-derived", "Capability intent is durable without a result; outcome is unknown", "warning")); }
  const projected: FactoryRun = { ...run, currentPhaseId: phase, status, executionStatus: uncertain ? "outcome_unknown" : execution, acceptanceStatus: acceptance, uncertainInvocation: uncertain || run.uncertainInvocation === true };
  const phaseIndex = new Map(entered.map((item, index) => [item, index])); const runPhaseIndex = phaseIndex.get(run.currentPhaseId); if (runPhaseIndex === undefined && !(phase === "request" && run.currentPhaseId === "scout")) divergent("run.json current phase is not a journal prefix");
  const terminalEvent = terminal && (phase === "accepted" || phase === "rejected");
  if (run.status === "succeeded" && !terminalEvent) divergent("run.json reports success without a durable accepted terminal event");
  if (run.status === "rejected" && !terminalEvent) divergent("run.json reports rejection without a durable rejected terminal event");
  if (run.status === "abandoned" && !events.some((event) => event.type === "operator.abandon")) divergent("run.json reports abandon without a durable operator event");
  if (run.executionStatus === "outcome_unknown" && !uncertain) divergent("run.json reports unknown without a durable unknown invocation");
  for (const [phaseId, envelope] of Object.entries(run.phaseEnvelopes ?? {})) {
    const result = [...successfulAttempts.values()].find((event) => event.data.phaseId === phaseId && event.data.attemptId === envelope.attemptId);
    if (!result || envelope.phaseId !== phaseId || envelope.status !== "succeeded") divergent(`phase envelope ${phaseId} is not backed by a successful journal result`);
  }
  if (run.currentPhaseId !== projected.currentPhaseId || run.status !== projected.status || run.executionStatus !== projected.executionStatus || run.acceptanceStatus !== projected.acceptanceStatus || run.uncertainInvocation !== projected.uncertainInvocation) {
    if (diagnostics.every((item) => item.code !== "runtime.state-divergent")) diagnostics.push(diagnostic("runtime.projection-derived", "run.json is a durable prefix of the journal and was conservatively projected from journal authority", "warning"));
  }
  if (diagnostics.some((item) => item.code === "runtime.state-divergent")) return { ...projected, status: "failed", executionStatus: "outcome_unknown", uncertainInvocation: true };
  return projected;
}
const execFileAsync = promisify(execFile);
async function gitHead(repositoryRoot: string): Promise<string> { const result = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, env: safeGitEnvironment(), timeout: 5_000, maxBuffer: RUNTIME_LIMITS.maxGitOutputBytes, encoding: "utf8" }); return result.stdout.trim(); }
async function assertRuntimeTopology(repositoryRoot: string, runtimeRoot: string): Promise<{ root: string; runtime: string }> {
  const root = await realpath(repositoryRoot); const runtime = resolve(runtimeRoot); const rel = relative(root, runtime); if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || resolve(runtime) !== join(root, ".pi", "factory", "runtime")) throw new Error("runtimeRoot must be the exact private repository runtime descendant"); await ensureNoSymlinkComponents(dirname(runtime)); return { root, runtime };
}
function excludedRepositoryPath(_root: string, runtimeRoot: string, candidate: string): boolean { const path = resolve(candidate); const runtime = resolve(runtimeRoot); const runtimeRelative = relative(runtime, path); return runtimeRelative === "" || (runtimeRelative !== ".." && !runtimeRelative.startsWith(`..${sep}`)); }
async function hashSnapshotFile(path: string, maximumBytes: number, expected: import("node:fs").Stats, label: string): Promise<{ digest: string; bytes: number }> {
  if (fsConstants.O_NOFOLLOW === undefined) throw new Error("No-follow file opening is unavailable");
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  const hasher = createHash("sha256"); let bytesRead = 0;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino || opened.size > maximumBytes) throw new Error(`${label} identity changed`);
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1));
    while (true) {
      const { bytesRead: count } = await handle.read(buffer, 0, buffer.byteLength, null);
      if (count === 0) break;
      bytesRead += count;
      if (bytesRead > maximumBytes) throw new RangeError(`${label} exceeds ${maximumBytes} bytes`);
      hasher.update(buffer.subarray(0, count));
    }
    const closed = await handle.stat();
    if (!closed.isFile() || closed.dev !== opened.dev || closed.ino !== opened.ino || closed.size !== bytesRead || closed.size !== expected.size) throw new Error(`${label} changed while reading`);
    return { digest: hasher.digest("hex"), bytes: bytesRead };
  } finally { await handle.close(); }
}

export async function repositorySnapshot(repositoryRoot: string, runtimeRoot: string): Promise<RepositoryIdentity> {
  const topology = await assertRuntimeTopology(repositoryRoot, runtimeRoot); const root = topology.root; const runtime = topology.runtime;
  const manifestHash = createHash("sha256"); const separator = String.fromCharCode(0); let manifestBytes = 0; let entryCount = 0; let totalBytes = 0;
  const addManifestLine = (line: string): void => {
    if (entryCount >= RUNTIME_LIMITS.maxSnapshotFiles) throw new RangeError("repository manifest has too many entries");
    const encoded = Buffer.from(`${line}\n`, "utf8");
    if (manifestBytes + encoded.byteLength > RUNTIME_LIMITS.maxManifestBytes) throw new RangeError("repository manifest exceeds encoded byte bound");
    manifestHash.update(encoded); manifestBytes += encoded.byteLength; entryCount += 1;
  };
  const visit = async (directory: string): Promise<void> => {
    const names: string[] = []; const handle = await opendir(directory);
    for await (const entry of handle) {
      names.push(entry.name);
      if (names.length + entryCount > RUNTIME_LIMITS.maxSnapshotFiles) throw new RangeError("repository manifest has too many entries");
    }
    names.sort();
    for (const name of names) {
      const path = join(directory, name); if (excludedRepositoryPath(root, runtime, path)) continue;
      const rel = relative(root, path).replaceAll(sep, "/"); if (!safeRelativePath(rel)) throw new Error(`repository manifest contains unsafe path ${rel}`);
      const item = await lstat(path);
      if (item.isSymbolicLink()) {
        const linkTarget = await readlink(path); const linkBytes = Buffer.byteLength(linkTarget, "utf8");
        if (linkBytes > RUNTIME_LIMITS.maxSymlinkBytes) throw new Error("repository symlink target exceeds bound");
        addManifestLine(`L${separator}${rel}${separator}${linkTarget}`);
      } else if (item.isDirectory()) { addManifestLine(`D${separator}${rel}`); await visit(path); }
      else if (item.isFile()) {
        if (item.size > RUNTIME_LIMITS.maxSnapshotBytes || totalBytes + item.size > RUNTIME_LIMITS.maxSnapshotBytes) throw new RangeError("repository manifest exceeds byte bound");
        const file = await hashSnapshotFile(path, RUNTIME_LIMITS.maxSnapshotBytes, item, `repository file ${rel}`); totalBytes += file.bytes; addManifestLine(`F${separator}${rel}${separator}${file.digest}`);
      } else throw new Error(`repository manifest contains unsupported nonregular path ${rel}`);
    }
  };
  await visit(root); const filesDigest = manifestHash.digest("hex"); return { head: await gitHead(root), filesDigest };
}
function environmentIdentity(): EnvironmentIdentity { const nodeMajor = Number(process.versions.node.split(".")[0]); const platform = process.platform; const arch = process.arch; const ci = process.env.CI === "true"; return { nodeMajor, platform, arch, ci, digest: jsonDigest({ nodeMajor, platform, arch, ci }) }; }
function promptRef(catalog: LoadedWorkflowCatalog, phaseId: "scout" | "architect"): ArtifactRef { const phase = catalog.workflow.phases.find((item) => item.id === phaseId); if (!phase?.promptAsset) throw new Error(`Prompt is missing for ${phaseId}`); const bytes = catalog.assets[phase.promptAsset]; if (!bytes) throw new Error(`Prompt asset is missing: ${phase.promptAsset}`); const promptDigest = digest(bytes); return { id: `prompt-${promptDigest.slice(0, 16)}`, kind: "prompt", path: phase.promptAsset, digest: promptDigest, bytes: bytes.byteLength }; }

export class PlanChangeRuntime {
  private readonly now: () => string; private readonly workflowDigest: string; private readonly environment: EnvironmentIdentity;
  constructor(private readonly options: PlanChangeRuntimeOptions) { assertPlanChangeTopology(options.catalog.workflow); this.now = options.now ?? (() => new Date().toISOString()); this.workflowDigest = digestWorkflow(options.catalog.workflow, options.catalog.assets); this.environment = environmentIdentity(); }
  async inspect(runId: string): Promise<RuntimeInspection> { const id = boundedString(runId, "runId", 128); try { await assertRuntimeTopology(this.options.repositoryRoot, this.options.runtimeRoot); } catch (error) { return { valid: false, events: [], uncertainInvocation: false, diagnostics: [diagnostic("runtime.topology-invalid", error instanceof Error ? error.message : "runtimeRoot topology is invalid")] }; } const repository = new RuntimeRepository(this.options.runtimeRoot, id); const inspection = await repository.inspect(); if (!inspection.valid || !inspection.run) return inspection; const diagnostics = [...inspection.diagnostics]; for (const envelope of Object.values(inspection.run.phaseEnvelopes ?? {})) for (const artifact of envelope.artifacts ?? []) { try { const bytes = await boundedRead(join(this.options.runtimeRoot, id, "artifacts", "plan.json"), RUNTIME_LIMITS.maxArtifactBytes, "plan artifact"); if (artifact.bytes !== bytes.byteLength || artifact.digest !== digest(bytes)) throw new Error("plan artifact identity is invalid"); } catch (error) { diagnostics.push(diagnostic("runtime.artifact-invalid", error instanceof Error ? error.message : "plan artifact is invalid")); } } return { ...inspection, valid: diagnostics.every((item) => item.severity !== "error"), diagnostics }; }
  async start(request: PlanChangeRequest, runId: string = randomUUID()): Promise<RuntimeExecution> {
    boundedString(request.requestId, "requestId", 256); boundedString(request.task, "task", 65_536); if (request.constraints && (request.constraints.length > 32 || request.constraints.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > 2_048))) throw new RangeError("constraints exceed their bound");
    await assertRuntimeTopology(this.options.repositoryRoot, this.options.runtimeRoot); const taskDigest = jsonDigest({ task: request.task, constraints: request.constraints ?? [] }); const store = new RuntimeRepository(this.options.runtimeRoot, runId); await store.prepare(); const before = await repositorySnapshot(this.options.repositoryRoot, this.options.runtimeRoot);
    const run: FactoryRun = { id: runId, workUnitId: request.requestId, workflowId: this.options.catalog.workflow.id, status: "running", currentPhaseId: "scout", executionStatus: "running", acceptanceStatus: "pending", uncertainInvocation: false, taskDigest, workflowDigest: this.workflowDigest, repositoryIdentity: before, environmentIdentity: this.environment, phaseEnvelopes: {} };
    await store.create(run);
    try {
      await store.append("phase.entered", { phaseId: "scout" });
      return await this.execute(store, run, request, before);
    } catch {
      let phaseId = run.currentPhaseId; let uncertainInvocation = false;
      try { const inspection = await store.inspect(); phaseId = inspection.run?.currentPhaseId ?? phaseId; uncertainInvocation = inspection.uncertainInvocation; } catch { /* recordLocalFailure remains the durable authority */ }
      return await this.recordLocalFailure(store, run, phaseId, uncertainInvocation);
    } finally { await store.release(); }
  }
  async resume(runId: string, _request?: PlanChangeRequest): Promise<RuntimeExecution> {
    const id = boundedString(runId, "runId", 128); const inspection = await this.inspect(id); if (!inspection.valid || !inspection.run) throw new Error("Cannot resume an invalid runtime");
    if (!isTerminal(inspection.run)) throw new Error(inspection.uncertainInvocation ? "uncertain capability invocation; run is nonterminal and cannot be resumed; inspect or abandon it" : "Run is nonterminal and cannot be resumed; inspect or abandon it");
    if (inspection.run.uncertainInvocation || inspection.uncertainInvocation || inspection.run.executionStatus === "outcome_unknown") return { runId: id, status: "outcome_unknown", acceptance: emptyAcceptance(), diagnostics: [diagnostic("capability.outcome-unknown", "Capability outcome remains unknown; no replay was attempted", "warning")] };
    return { runId: id, status: inspection.run.status === "succeeded" ? "accepted" : inspection.run.status === "rejected" ? "rejected" : "failed", acceptance: emptyAcceptance(), diagnostics: [] };
  }
  async abandon(runId: string, operator = "operator"): Promise<RuntimeInspection> {
    boundedString(operator, "operator", 256); const store = new RuntimeRepository(this.options.runtimeRoot, boundedString(runId, "runId", 128)); await store.claimForAbandon();
    try { const inspection = await store.inspect(); if (!inspection.run || inspection.diagnostics.some((item) => ["runtime.path-corrupt", "runtime.run-corrupt", "runtime.journal-corrupt", "runtime.topology-invalid"].includes(item.code))) throw new Error("Cannot abandon an invalid runtime"); if (inspection.run.status === "succeeded" || inspection.run.status === "rejected" || inspection.run.status === "abandoned") throw new Error(`Run is already terminal: ${inspection.run.status}`);
      const abandoned: FactoryRun = { ...inspection.run, status: "abandoned", ...(inspection.run.uncertainInvocation || inspection.uncertainInvocation ? { executionStatus: "outcome_unknown" as const, uncertainInvocation: true } : {}) };
      await store.append("operator.abandon", { operator }); await store.writeRun(abandoned); return await store.inspect();
    } finally { await store.release(); }
  }
  private async execute(store: RuntimeRepository, initial: FactoryRun, request: PlanChangeRequest, before: RepositoryIdentity): Promise<RuntimeExecution> {
    let run = initial; let scoutOutput: ScoutOutput | undefined; let architectOutput: ArchitectOutput | undefined;
    for (let step = 0; step < this.options.catalog.workflow.maxTraversalSteps; step += 1) {
      if (run.currentPhaseId === "scout") { const result = await this.dispatch(store, run, "scout", { task: request.task }, before, request.signal); if (result.status !== "succeeded") return this.outcome(result.run); let scoutValid = false; try { scoutValid = validateScout(result.output); } catch { scoutValid = false; } if (!scoutValid) return this.fail(store, result.run, "scout.invalid-output", "Scout output failed its strict schema", "scout"); scoutOutput = result.output as ScoutOutput; const envelope: PhaseEnvelope = { ...result.envelope, output: scoutOutput }; run = { ...result.run, currentPhaseId: "handoff", phaseEnvelopes: { scout: envelope } }; await store.append("phase.entered", { phaseId: "handoff" }); await store.writeRun(run);
        const afterScout = await repositorySnapshot(this.options.repositoryRoot, this.options.runtimeRoot); if (jsonDigest(before) !== jsonDigest(afterScout)) return this.fail(store, run, "gate.repository-mutated-after-scout", "Repository changed after scout; architect was not dispatched", "scout"); continue; }
      if (run.currentPhaseId === "handoff") { if (!scoutOutput) return this.fail(store, run, "handoff.missing-scout", "Settled scout evidence is missing", "handoff"); let handoff; try { handoff = formatScoutToArchitectRequest({ requestId: run.workUnitId, task: request.task, scout: scoutOutput, ...(request.constraints ? { constraints: request.constraints } : {}) }); } catch { return this.fail(store, run, "handoff.invalid", "Scout handoff failed its bounded schema", "handoff"); }
        await store.append("phase.result", { phaseId: "handoff", attemptId: `${run.id}-handoff`, status: "succeeded", outputDigest: jsonDigest(handoff), diagnosticCodes: [] }); run = { ...run, currentPhaseId: "architect" }; await store.append("phase.entered", { phaseId: "architect" }); await store.writeRun(run); const result = await this.dispatch(store, run, "architect", handoff, before, request.signal); if (result.status !== "succeeded") return this.outcome(result.run); let architectValid = false; try { architectValid = validateArchitect(result.output); } catch { architectValid = false; } if (!architectValid) return this.fail(store, result.run, "architect.invalid-output", "Architect output failed its strict nested schema", "architect"); architectOutput = result.output as ArchitectOutput; const artifact = await this.writePlanArtifact(store, architectOutput); const envelope: PhaseEnvelope = { ...result.envelope, artifacts: [artifact] }; run = { ...result.run, currentPhaseId: "gates", phaseEnvelopes: { ...result.run.phaseEnvelopes, architect: envelope } }; await store.append("phase.entered", { phaseId: "gates" }); await store.writeRun(run); continue; }
      if (run.currentPhaseId === "architect") return this.fail(store, run, "runtime.architect-invocation-incomplete", "Architect invocation is not replayable", "architect");
      if (run.currentPhaseId === "gates") { const acceptance = await this.evaluateGates(store, run, architectOutput, before); const accepted = acceptance.accepted; run = { ...run, currentPhaseId: accepted ? "accepted" : "rejected", status: accepted ? "succeeded" : "rejected", executionStatus: "succeeded", acceptanceStatus: accepted ? "accepted" : "rejected" }; await store.append("acceptance.result", { accepted, checkIds: acceptance.gateReports.map((report) => report.gateId), failedCheckIds: acceptance.gateReports.filter((report) => !report.passed).map((report) => report.gateId) }); await store.append("phase.entered", { phaseId: run.currentPhaseId }); await store.writeRun(run); return { runId: run.id, status: accepted ? "accepted" : "rejected", acceptance, diagnostics: acceptance.diagnostics }; }
      return this.fail(store, run, "runtime.invalid-phase", "Runtime phase is not supported", run.currentPhaseId);
    }
    return this.fail(store, run, "runtime.traversal-bound", "Workflow traversal exceeded its bound", run.currentPhaseId);
  }
  private async dispatch(store: RuntimeRepository, run: FactoryRun, phaseId: "scout" | "architect", input: unknown, before: RepositoryIdentity, requestSignal?: AbortSignal): Promise<{ status: "succeeded"; output: unknown; envelope: PhaseEnvelope; run: FactoryRun } | { status: "failed" | "outcome_unknown"; run: FactoryRun }> {
    const target: "pi_dev.scout" | "pi_dev.architect" = phaseId === "scout" ? "pi_dev.scout" : "pi_dev.architect"; const phase = this.options.catalog.workflow.phases.find((item) => item.id === phaseId); if (!phase || jsonBytes(input) > phase.maxInputBytes) return { status: "failed", run: await this.failRun(store, run, phaseId, "capability.input-bound") };
    if (requestSignal?.aborted) return { status: "failed", run: await this.failRun(store, run, phaseId, "capability.cancelled-before-dispatch") };
    const attemptId = `${run.id}-${phaseId}-${randomUUID()}`; const timeout = Math.min(Math.max(this.options.dispatchTimeoutMs ?? 300_000, 1), RUNTIME_LIMITS.maxDispatchTimeoutMs); const deadlineEpochMs = Date.now() + timeout; const deadlineMonotonicMs = performance.now() + timeout; const invocation = { runId: run.id, phaseId, target, input, inputDigest: jsonDigest(input), workflowDigest: this.workflowDigest, prompt: promptRef(this.options.catalog, phaseId), repositoryIdentityDigest: jsonDigest(before), environmentIdentityDigest: this.environment.digest, deadline: deadlineEpochMs };
    await store.append("capability.dispatch_intent", { phaseId, target, attemptId, inputDigest: invocation.inputDigest, workflowDigest: invocation.workflowDigest, repositoryIdentityDigest: invocation.repositoryIdentityDigest, environmentIdentityDigest: invocation.environmentIdentityDigest });
    const grace = Math.min(Math.max(this.options.dispatchGraceMs ?? 100, 0), RUNTIME_LIMITS.maxDispatchGraceMs); const controller = new AbortController(); let invalidateDispatch: () => void = () => { controller.abort(); }; const onRequestAbort = () => { invalidateDispatch(); }; requestSignal?.addEventListener("abort", onRequestAbort, { once: true });
    const portPromise: Promise<unknown> = Promise.resolve().then(() => this.options.capabilityPort.dispatch(target, { ...invocation, signal: controller.signal })); let timer: NodeJS.Timeout | undefined; let graceTimer: NodeJS.Timeout | undefined; let timedOut = false; let invalidated = Boolean(requestSignal?.aborted); let settled = false;
    const resultPromise = new Promise<unknown>((resolveResult) => {
      const settle = (value: unknown): void => { if (settled) return; settled = true; resolveResult(value); };
      invalidateDispatch = () => { invalidated = true; controller.abort(); if (!timedOut) settle({ status: "outcome_unknown" }); };
      if (invalidated) invalidateDispatch();
      timer = setTimeout(() => { timedOut = true; invalidateDispatch(); graceTimer = setTimeout(() => settle({ status: "outcome_unknown" }), grace); }, timeout);
      portPromise.then((result) => { if (!invalidated || (timedOut && isRecord(result) && result.status === "outcome_unknown")) settle(result); }, () => { if (!invalidated) settle({ status: "outcome_unknown" }); });
    });
    let raw: unknown; try { raw = await resultPromise; } finally { if (timer) clearTimeout(timer); if (graceTimer) clearTimeout(graceTimer); requestSignal?.removeEventListener("abort", onRequestAbort); }
    let normalized: { status: "succeeded" | "failed" | "outcome_unknown"; output?: unknown; receipt?: CapabilityReceiptRef; code: string; outputRejected?: boolean };
    try {
      if (!isRecord(raw) || !["succeeded", "failed", "outcome_unknown"].includes(raw.status as string)) normalized = { status: "outcome_unknown", code: "capability.malformed-result" };
      else if (raw.status === "outcome_unknown") {
        const receipt = raw.receipt === undefined ? undefined : validateReceipt(raw.receipt, target, "outcome_unknown");
        if ((raw.diagnostics !== undefined && (!Array.isArray(raw.diagnostics) || raw.diagnostics.length > 64 || raw.diagnostics.some((item) => !isRecord(item) || typeof item.code !== "string" || item.code.length > 256))) || (raw.receipt !== undefined && !receipt)) normalized = { status: "outcome_unknown", code: "capability.malformed-result" };
        else normalized = { status: "outcome_unknown", code: "capability.outcome-unknown", ...(receipt ? { receipt } : {}) };
      } else if (raw.status === "failed") {
        const receipt = raw.receipt === undefined ? undefined : validateReceipt(raw.receipt, target, "failed");
        if (!Array.isArray(raw.diagnostics) || raw.diagnostics.length > 64 || raw.diagnostics.some((item) => !isRecord(item) || typeof item.code !== "string" || item.code.trim().length === 0 || item.code.length > 256) || (raw.receipt !== undefined && !receipt)) normalized = { status: "outcome_unknown", code: "capability.malformed-result" };
        else normalized = { status: "failed", ...(receipt ? { receipt } : {}), code: (raw.diagnostics as Record<string, unknown>[]).map((item) => item.code as string).slice(0, 16).join("|") || "capability.failed" };
      } else {
        const output = raw.output; const outputBytes = jsonBytes(output); const receipt = validateReceipt(raw.receipt, target, "succeeded");
        if (!receipt) normalized = { status: "outcome_unknown", code: "capability.malformed-result" };
        else if (outputBytes > phase.maxOutputBytes) normalized = { status: "succeeded", output, receipt, code: "capability.output-bound", outputRejected: true };
        else normalized = { status: "succeeded", output, receipt, code: "" };
      }
    } catch { normalized = { status: "outcome_unknown", code: "capability.malformed-result" }; }
    const deadlineExceeded = timedOut || Date.now() >= deadlineEpochMs || performance.now() >= deadlineMonotonicMs; const settledStatus: DispatchStatus = deadlineExceeded ? "outcome_unknown" : normalized.status; const code = deadlineExceeded ? "capability.outcome-unknown" : normalized.code; const receipt = deadlineExceeded ? (normalized.status === "outcome_unknown" ? normalized.receipt : undefined) : normalized.receipt;
    await store.append("capability.dispatch_result", { phaseId, target, attemptId, status: settledStatus, ...(receipt ? { receipt } : {}), diagnosticCodes: code ? [code] : [] });
    const outputRejected = settledStatus === "succeeded" && normalized.outputRejected; if (settledStatus !== "succeeded" || outputRejected) { const phaseResultStatus = outputRejected ? "failed" : settledStatus; const failedRun: FactoryRun = { ...run, status: "failed", executionStatus: settledStatus === "succeeded" ? "failed" : settledStatus, uncertainInvocation: settledStatus === "outcome_unknown" }; await store.append("phase.result", { phaseId, attemptId, status: phaseResultStatus, outputDigest: "", diagnosticCodes: code ? [code] : [] }); await store.writeRun(failedRun); return { status: settledStatus === "succeeded" ? "failed" : settledStatus, run: failedRun }; }
    const output = normalized.output; const envelope: PhaseEnvelope = { phaseId, attemptId, status: "succeeded", output, diagnostics: [], receipt: normalized.receipt as CapabilityReceiptRef }; const succeededRun: FactoryRun = { ...run, executionStatus: "succeeded", phaseEnvelopes: { ...run.phaseEnvelopes, [phaseId]: envelope } }; await store.append("phase.result", { phaseId, attemptId, status: "succeeded", outputDigest: jsonDigest(output), diagnosticCodes: [] }); await store.writeRun(succeededRun); return { status: "succeeded", output, envelope, run: succeededRun };
  }
  private async recordLocalFailure(store: RuntimeRepository, fallback: FactoryRun, phaseId: string, uncertainInvocation: boolean): Promise<RuntimeExecution> {
    const inspection = await store.inspect(); const current = inspection.run ?? fallback;
    if (current.status === "succeeded" || current.status === "rejected" || current.status === "abandoned") return this.outcome(current);
    const unknown = uncertainInvocation || inspection.uncertainInvocation || current.uncertainInvocation === true;
    const failed: FactoryRun = { ...current, status: "failed", executionStatus: unknown ? "outcome_unknown" : "failed", uncertainInvocation: unknown };
    const attemptId = `${current.id}-${phaseId}-local`;
    if (!inspection.events.some((event) => event.type === "phase.result" && event.data.attemptId === attemptId)) await store.append("phase.result", { phaseId, attemptId, status: "failed", outputDigest: "", diagnosticCodes: ["runtime.local-failure"] });
    await store.writeRun(failed);
    return { runId: current.id, status: unknown ? "outcome_unknown" : "failed", acceptance: emptyAcceptance(), diagnostics: [diagnostic("runtime.local-failure", "Runtime failed during a local phase operation", unknown ? "warning" : "error", phaseId)] };
  }
  private async failRun(store: RuntimeRepository, run: FactoryRun, phaseId: string, code: string): Promise<FactoryRun> { const failed = { ...run, status: "failed" as const, executionStatus: "failed" as const }; await store.append("phase.result", { phaseId, attemptId: `${run.id}-${phaseId}-rejected`, status: "failed", outputDigest: "", diagnosticCodes: [code] }); await store.writeRun(failed); return failed; }
  private async fail(store: RuntimeRepository, run: FactoryRun, code: string, message: string, phaseId: string): Promise<RuntimeExecution> { const failed = { ...run, status: "failed" as const, executionStatus: "failed" as const }; await store.append("phase.result", { phaseId, attemptId: `${run.id}-${phaseId}-local`, status: "failed", outputDigest: "", diagnosticCodes: [code] }); await store.writeRun(failed); return { runId: run.id, status: "failed", acceptance: emptyAcceptance(), diagnostics: [diagnostic(code, message, "error", phaseId)] }; }
  private async writePlanArtifact(store: RuntimeRepository, output: ArchitectOutput): Promise<ArtifactRef> { const selected = { artifactVersion: 1, workflowId: this.options.catalog.workflow.id, workflowDigest: this.workflowDigest, sourcePhaseId: "architect", summary: output.summary, assumptions: output.assumptions, plan: output.plan, risks: output.risks, acceptanceCriteria: output.acceptanceCriteria }; const content = `${JSON.stringify(selected)}\n`; if (Buffer.byteLength(content) > RUNTIME_LIMITS.maxArtifactBytes) throw new RangeError("plan artifact exceeds runtime bound"); const path = join(store.runtimeRoot, store.runId, "artifacts", "plan.json"); await atomicWrite(path, content); const item = await lstat(path); if (item.isSymbolicLink() || !item.isFile()) throw new Error("plan artifact is not a private regular file"); const artifactDigest = digest(content); return { id: `plan-${artifactDigest.slice(0, 16)}`, kind: "report", path: "artifacts/plan.json", digest: artifactDigest, bytes: Buffer.byteLength(content) }; }
  private async evaluateGates(store: RuntimeRepository, run: FactoryRun, architect: ArchitectOutput | undefined, before: RepositoryIdentity): Promise<AcceptanceResult> {
    const checks: GateCheck[] = []; const artifact = run.phaseEnvelopes?.architect?.artifacts?.[0]; let artifactObject: Record<string, unknown> | undefined; let artifactBytes = 0;
    try { if (!artifact || artifact.path !== "artifacts/plan.json" || !artifact.digest || artifact.id !== `plan-${artifact.digest.slice(0, 16)}`) throw new Error("fixed plan artifact reference is missing"); const path = join(store.runtimeRoot, run.id, artifact.path); const bytes = await boundedRead(path, RUNTIME_LIMITS.maxArtifactBytes, "plan artifact"); artifactBytes = bytes.byteLength; artifactObject = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>; if (artifact.bytes !== bytes.byteLength || artifact.digest !== digest(bytes)) throw new Error("plan artifact identity is invalid"); checks.push({ id: "plan-artifact-exists", passed: true, explanation: "The fixed plan artifact is a bounded regular file with the recorded digest." }); } catch { checks.push({ id: "plan-artifact-exists", passed: false, explanation: "The fixed plan artifact is missing, malformed, or not durably addressable." }); }
    checks.push({ id: "plan-artifact-nonempty", passed: artifactBytes > 0, explanation: artifactBytes > 0 ? "The selected plan artifact is non-empty." : "The selected plan artifact is empty." });
    const sections = Boolean(architect && architect.assumptions.length > 0 && architect.plan.length > 0 && architect.risks.length > 0 && architect.acceptanceCriteria.length > 0 && architect.plan.every((item, index) => item.order === index + 1)); checks.push({ id: "structured-sections", passed: sections, explanation: sections ? "Required plan sections are non-empty and ordered from one." : "Required plan sections are empty or out of order." });
    const identity = Boolean(artifact && artifactObject && artifactObject.artifactVersion === 1 && artifactObject.workflowId === this.options.catalog.workflow.id && artifactObject.workflowDigest === this.workflowDigest && artifactObject.sourcePhaseId === "architect" && digest(`${JSON.stringify(artifactObject)}\n`) === artifact.digest); checks.push({ id: "identity-digest", passed: identity, explanation: identity ? "Workflow, artifact, and digest identities agree." : "Workflow, artifact, or digest identities diverge." });
    const receipts = [run.phaseEnvelopes?.scout?.receipt, run.phaseEnvelopes?.architect?.receipt]; const receiptsValid = receipts.every((receipt, index) => receipt !== undefined && receipt.schemaVersion === 1 && receipt.target === (index === 0 ? "pi_dev.scout" : "pi_dev.architect") && receipt.state === "succeeded" && receipt.projectionDigest.length === 64); checks.push({ id: "receipt-refs", passed: receiptsValid, explanation: receiptsValid ? "Both capability phases retain bounded Protocol v1 receipt projections." : "A capability receipt projection is absent or mismatched." });
    const after = await repositorySnapshot(this.options.repositoryRoot, this.options.runtimeRoot); const unchanged = jsonDigest(before) === jsonDigest(after); checks.push({ id: "no-repository-mutation", passed: unchanged, explanation: unchanged ? "The complete no-follow worktree manifest is unchanged." : "The complete worktree manifest changed during execution." });
    const gateReports = checks.map((check) => ({ gateId: check.id, passed: check.passed, checks: [check], diagnostics: check.passed ? [] : [diagnostic(`gate.${check.id}`, check.explanation, "error", "gates")] })); return { accepted: checks.every((check) => check.passed), gateReports, diagnostics: gateReports.flatMap((report) => report.diagnostics) };
  }
  private outcome(run: FactoryRun): RuntimeExecution { const status = run.uncertainInvocation ? "outcome_unknown" : run.status === "succeeded" ? "accepted" : run.status === "rejected" ? "rejected" : "failed"; return { runId: run.id, status, acceptance: emptyAcceptance(), diagnostics: run.uncertainInvocation ? [diagnostic("capability.outcome-unknown", "Capability invocation outcome is unknown; it will not be replayed", "warning")] : [] }; }
}
export function createPlanChangeRuntime(options: PlanChangeRuntimeOptions): PlanChangeRuntime { return new PlanChangeRuntime(options); }
export async function runPlanChange(runtime: PlanChangeRuntime, request: PlanChangeRequest, runId?: string): Promise<RuntimeExecution> { return runId === undefined ? runtime.start(request) : runtime.start(request, runId); }
