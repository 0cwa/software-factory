import { join, resolve } from "node:path";
import { defaultStateDirectory } from "../config.ts";
import { isSafeId } from "../schemas.ts";

export interface RepositoryPaths {
  root: string;
  pipelines: string;
  index: string;
}

export function repositoryPaths(root = defaultStateDirectory()): RepositoryPaths {
  const absolute = resolve(root);
  return { root: absolute, pipelines: join(absolute, "pipelines"), index: join(absolute, "index.json") };
}

export function pipelineDirectory(paths: RepositoryPaths, id: string): string {
  if (!isSafeId(id)) throw new Error(`Unsafe pipeline id: ${JSON.stringify(id)}`);
  return join(paths.pipelines, id);
}

export function pipelineSpecPath(paths: RepositoryPaths, id: string): string {
  return join(pipelineDirectory(paths, id), "pipeline.json");
}

export function pipelineManifestPath(paths: RepositoryPaths, id: string): string {
  return join(pipelineDirectory(paths, id), "pi.protocol.json");
}
