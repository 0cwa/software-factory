import { lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import type { ProtocolManifestV1 as PiProtocolManifest } from "@kybernetria/pi-protocol/contract";
import { isSafeId } from "../schemas.ts";
import type { PersistedIndexV1, PipelineSpecV1, PipelineStatus } from "../types.ts";
import { atomicWriteFile } from "./atomic-write.ts";
import {
  pipelineDirectory,
  pipelineManifestPath,
  pipelineSpecPath,
  repositoryPaths,
  type RepositoryPaths,
} from "./paths.ts";

const MAX_SPEC_BYTES = 10 * 1024 * 1024;

export interface RepositoryRecord {
  id: string;
  value?: unknown;
  error?: string;
}

export interface PipelineFilesSnapshot {
  pipeline?: string;
  manifest?: string;
}

export class PipelineRepository {
  readonly paths: RepositoryPaths;

  constructor(root?: string) {
    this.paths = repositoryPaths(root);
  }

  async initialize(): Promise<void> {
    await mkdir(this.paths.pipelines, { recursive: true, mode: 0o700 });
    await assertDirectoryNotSymlink(this.paths.root);
    await assertDirectoryNotSymlink(this.paths.pipelines);
  }

  async readAll(): Promise<RepositoryRecord[]> {
    await this.initialize();
    const entries = await readdir(this.paths.pipelines, { withFileTypes: true });
    const records: RepositoryRecord[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !isSafeId(entry.name)) continue;
      const directory = pipelineDirectory(this.paths, entry.name);
      try {
        const stats = await lstat(directory);
        if (!stats.isDirectory() || stats.isSymbolicLink()) continue;
        const text = await readLimited(pipelineSpecPath(this.paths, entry.name));
        records.push({ id: entry.name, value: JSON.parse(text) });
      } catch (error) {
        records.push({ id: entry.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return records;
  }

  async read(id: string): Promise<unknown | undefined> {
    if (!isSafeId(id)) return undefined;
    try {
      return JSON.parse(await readLimited(pipelineSpecPath(this.paths, id)));
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async snapshot(id: string): Promise<PipelineFilesSnapshot | undefined> {
    if (!isSafeId(id)) throw new Error(`Unsafe pipeline id: ${JSON.stringify(id)}`);
    const [pipeline, manifest] = await Promise.all([
      readOptional(pipelineSpecPath(this.paths, id)),
      readOptional(pipelineManifestPath(this.paths, id)),
    ]);
    return pipeline === undefined && manifest === undefined ? undefined : { pipeline, manifest };
  }

  async persist(spec: PipelineSpecV1, manifest: PiProtocolManifest): Promise<void> {
    await this.initialize();
    const directory = pipelineDirectory(this.paths, spec.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await assertDirectoryNotSymlink(directory);
    // pipeline.json is the source of truth; the manifest is deterministic derived output.
    await atomicWriteFile(pipelineSpecPath(this.paths, spec.id), pretty(spec));
    await atomicWriteFile(pipelineManifestPath(this.paths, spec.id), pretty(manifest));
  }

  async restore(id: string, snapshot: PipelineFilesSnapshot | undefined): Promise<void> {
    if (!snapshot) {
      await this.delete(id);
      return;
    }
    const directory = pipelineDirectory(this.paths, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await assertDirectoryNotSymlink(directory);
    if (snapshot.pipeline !== undefined) await atomicWriteFile(pipelineSpecPath(this.paths, id), snapshot.pipeline);
    else await rm(pipelineSpecPath(this.paths, id), { force: true });
    if (snapshot.manifest !== undefined) await atomicWriteFile(pipelineManifestPath(this.paths, id), snapshot.manifest);
    else await rm(pipelineManifestPath(this.paths, id), { force: true });
  }

  async delete(id: string): Promise<boolean> {
    if (!isSafeId(id)) throw new Error(`Unsafe pipeline id: ${JSON.stringify(id)}`);
    const directory = pipelineDirectory(this.paths, id);
    try {
      const stats = await lstat(directory);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Refusing to delete non-directory pipeline path: ${directory}`);
      await rm(directory, { recursive: true, force: false });
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async writeIndex(statuses: PipelineStatus[]): Promise<void> {
    await this.initialize();
    const index: PersistedIndexV1 = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      pipelines: [...statuses].sort((left, right) => left.id.localeCompare(right.id)),
    };
    await atomicWriteFile(this.paths.index, pretty(index));
  }
}

async function readLimited(path: string): Promise<string> {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Expected a regular pipeline JSON file: ${path}`);
  if (stats.size > MAX_SPEC_BYTES) throw new Error(`Pipeline JSON exceeds ${MAX_SPEC_BYTES} bytes: ${path}`);
  return readFile(path, "utf8");
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function assertDirectoryNotSymlink(path: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Expected a real state directory, not a symlink: ${path}`);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
