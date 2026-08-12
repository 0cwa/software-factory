import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FactoryConfig, FactoryPaths, WorkflowDefinition } from "./contracts.js";
import { assertValidWorkflow, WORKFLOW_LIMITS, type WorkflowAssets } from "./workflow.js";

export const PLAN_CHANGE_WORKFLOW_ID = "plan-change" as const;
export const PLAN_CHANGE_WORKFLOW_VERSION = 1 as const;
export const PLAN_CHANGE_WORKFLOW_FILE = "plan-change.json" as const;

export const CATALOG_LIMITS = {
  maxWorkflowBytes: 256 * 1024,
  maxPromptAssets: WORKFLOW_LIMITS.maxPhases,
  maxPromptBytes: WORKFLOW_LIMITS.maxPromptBytes,
  maxPromptAggregateBytes: WORKFLOW_LIMITS.maxPromptAggregateBytes,
} as const;

export interface LoadedWorkflowCatalog {
  readonly workflow: WorkflowDefinition;
  readonly assets: WorkflowAssets;
}

export interface CatalogReadHooks { readonly afterOpen?: (path: string) => void | Promise<void>; }

export function defaultFactoryPaths(root = fileURLToPath(new URL("../", import.meta.url))): FactoryPaths {
  return { root, workflows: join(root, "workflows"), prompts: join(root, "prompts") };
}

export function defaultFactoryConfig(root?: string): FactoryConfig {
  return { paths: defaultFactoryPaths(root) };
}

function trackedPath(directory: string, relativePath: string): string {
  const directoryRoot = resolve(directory);
  const candidate = resolve(directoryRoot, relativePath);
  const relativeCandidate = relative(directoryRoot, candidate);
  const withinDirectory = candidate === directoryRoot || (relativeCandidate !== "" && relativeCandidate !== ".." && !relativeCandidate.startsWith(`..${"/"}`) && !relativeCandidate.startsWith(`..${String.fromCharCode(92)}`));
  if (!withinDirectory) throw new Error(`Asset path escapes tracked directory: ${relativePath}`);
  return candidate;
}

function fileType(stat: import("node:fs").Stats): number { return stat.mode & fsConstants.S_IFMT; }
function sameRegularIdentity(left: import("node:fs").Stats, right: import("node:fs").Stats): boolean {
  return left.isFile() && right.isFile() && fileType(left) === fileType(right) && left.dev === right.dev && left.ino === right.ino;
}

async function readBoundedRegularFile(trustedRoot: string, directory: string, relativePath: string, maximumBytes: number, label: string, hooks: CatalogReadHooks = {}): Promise<Uint8Array> {
  if (fsConstants.O_NOFOLLOW === undefined) throw new Error("No-follow file opening is unavailable");
  const trustedRootRealPath = await realpath(resolve(trustedRoot));
  const directoryRealPath = await realpath(resolve(directory));
  const directoryRelativePath = relative(trustedRootRealPath, directoryRealPath);
  const directoryWithinRoot = directoryRelativePath === "" || (directoryRelativePath !== ".." && !directoryRelativePath.startsWith(`..${"/"}`) && !directoryRelativePath.startsWith(`..${String.fromCharCode(92)}`));
  if (!directoryWithinRoot) throw new Error(`${label} directory escapes trusted root: ${directory}`);
  const candidate = trackedPath(directoryRealPath, relativePath);
  const beforePathStat = await lstat(candidate);
  if (!beforePathStat.isFile()) throw new Error(`${label} is not a regular file: ${relativePath}`);
  const fileRealPath = await realpath(candidate);
  const relativeFilePath = relative(directoryRealPath, fileRealPath);
  const withinDirectory = relativeFilePath === "" || (relativeFilePath !== ".." && !relativeFilePath.startsWith(`..${"/"}`) && !relativeFilePath.startsWith(`..${String.fromCharCode(92)}`));
  const fileRelativeToRoot = relative(trustedRootRealPath, fileRealPath);
  const withinRoot = fileRelativeToRoot === "" || (fileRelativeToRoot !== ".." && !fileRelativeToRoot.startsWith(`..${"/"}`) && !fileRelativeToRoot.startsWith(`..${String.fromCharCode(92)}`));
  if (!withinDirectory || !withinRoot) throw new Error(`${label} escapes tracked directory: ${relativePath}`);

  const handle = await open(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const openedStat = await handle.stat();
    if (!sameRegularIdentity(beforePathStat, openedStat) || openedStat.size !== beforePathStat.size) throw new Error(`${label} changed while opening: ${relativePath}`);
    if (openedStat.size > maximumBytes) throw new Error(`${label} exceeds ${maximumBytes} bytes: ${relativePath}`);
    if (hooks.afterOpen) await hooks.afterOpen(candidate);
    const bytes = new Uint8Array(maximumBytes + 1);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maximumBytes) throw new Error(`${label} exceeds ${maximumBytes} bytes: ${relativePath}`);
    const afterHandleStat = await handle.stat();
    const afterPathStat = await lstat(candidate);
    if (!sameRegularIdentity(openedStat, afterHandleStat) || afterHandleStat.size !== offset || !sameRegularIdentity(openedStat, afterPathStat) || afterPathStat.size !== afterHandleStat.size) {
      throw new Error(`${label} changed while reading: ${relativePath}`);
    }
    return bytes.slice(0, offset);
  } finally {
    await handle.close();
  }
}

function assertPinnedPlanChange(raw: unknown): asserts raw is Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Plan-change workflow must be an object");
  const record = raw as Record<string, unknown>;
  if (record.id !== PLAN_CHANGE_WORKFLOW_ID || record.version !== PLAN_CHANGE_WORKFLOW_VERSION) {
    throw new Error(`Plan-change catalog is pinned to ${PLAN_CHANGE_WORKFLOW_ID}@${PLAN_CHANGE_WORKFLOW_VERSION}`);
  }
}

function promptPathsFromWorkflow(raw: Record<string, unknown>): string[] {
  if (!Array.isArray(raw.phases) || raw.phases.length > WORKFLOW_LIMITS.maxPhases) {
    throw new Error(`Workflow phases exceed ${WORKFLOW_LIMITS.maxPhases} items`);
  }
  const paths = new Set<string>();
  for (const phase of raw.phases) {
    if (typeof phase !== "object" || phase === null || Array.isArray(phase)) continue;
    const promptAsset = (phase as Record<string, unknown>).promptAsset;
    if (promptAsset === undefined) continue;
    if (typeof promptAsset !== "string" || promptAsset.length === 0 || promptAsset.length > 128) {
      throw new Error("Prompt asset reference is invalid");
    }
    paths.add(promptAsset);
    if (paths.size > CATALOG_LIMITS.maxPromptAssets) throw new Error(`Prompt assets exceed ${CATALOG_LIMITS.maxPromptAssets} items`);
  }
  return [...paths];
}

export async function loadPlanChangeCatalog(paths = defaultFactoryPaths(), hooks: CatalogReadHooks = {}): Promise<LoadedWorkflowCatalog> {
  const workflowBytes = await readBoundedRegularFile(paths.root, paths.workflows, PLAN_CHANGE_WORKFLOW_FILE, CATALOG_LIMITS.maxWorkflowBytes, "Workflow", hooks);
  const raw = JSON.parse(Buffer.from(workflowBytes).toString("utf8")) as unknown;
  assertPinnedPlanChange(raw);
  const promptPaths = promptPathsFromWorkflow(raw);
  const assets: Record<string, Uint8Array> = {};
  let aggregatePromptBytes = 0;
  for (const assetPath of promptPaths) {
    const bytes = await readBoundedRegularFile(paths.root, paths.prompts, assetPath, CATALOG_LIMITS.maxPromptBytes, "Prompt asset", hooks);
    aggregatePromptBytes += bytes.byteLength;
    if (aggregatePromptBytes > CATALOG_LIMITS.maxPromptAggregateBytes) throw new Error(`Prompt assets exceed ${CATALOG_LIMITS.maxPromptAggregateBytes} aggregate bytes`);
    assets[assetPath] = bytes;
  }
  assertValidWorkflow(raw, assets);
  return { workflow: raw as unknown as WorkflowDefinition, assets };
}

export async function loadPlanChangeDefinition(config = defaultFactoryConfig()): Promise<LoadedWorkflowCatalog> {
  return loadPlanChangeCatalog(config.paths);
}
