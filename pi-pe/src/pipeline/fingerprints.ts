import { createHash } from "node:crypto";
import type { DependencySnapshot, ResolvedTarget } from "../types.ts";
import { canonicalStringify, deepCloneJson } from "../schemas.ts";
import { parseTarget } from "../schemas.ts";

export function fingerprintTarget(target: ResolvedTarget): string {
  return sha256({
    inputSchema: target.provide.inputSchema,
    outputSchema: target.provide.outputSchema,
    execution: target.provide.execution,
    effects: [...(target.provide.effects ?? [])].sort(),
    version: target.provide.version ?? target.nodeVersion ?? null,
  });
}

export function createDependencySnapshot(targetName: string, resolved: ResolvedTarget): DependencySnapshot {
  const parsed = parseTarget(targetName);
  if (!parsed) throw new Error(`Invalid target: ${targetName}`);
  return {
    target: targetName,
    nodeId: parsed.nodeId,
    provide: parsed.provide,
    ...(resolved.packageId ? { packageId: resolved.packageId } : {}),
    ...(resolved.nodeVersion ? { nodeVersion: resolved.nodeVersion } : {}),
    ...(resolved.provide.version ? { provideVersion: resolved.provide.version } : {}),
    execution: { ...resolved.provide.execution },
    effects: [...new Set(resolved.provide.effects ?? [])].sort(),
    inputSchema: deepCloneJson(resolved.provide.inputSchema),
    outputSchema: deepCloneJson(resolved.provide.outputSchema),
    fingerprint: fingerprintTarget(resolved),
  };
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalStringify(value)).digest("hex");
}
