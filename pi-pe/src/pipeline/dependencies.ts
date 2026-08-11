import { PipelineError } from "../errors.ts";
import type { DependencySnapshot, Issue, PipelineSpecV1, ResolvedTarget, TargetResolver } from "../types.ts";
import { checkDependencyContractCompatibility } from "./compatibility.ts";
import { fingerprintTarget } from "./fingerprints.ts";

export interface DependencyCheckResult {
  usable: boolean;
  issues: Issue[];
  current: Map<string, ResolvedTarget>;
}

export function checkPipelineDependencies(spec: PipelineSpecV1, resolveTarget: TargetResolver): DependencyCheckResult {
  const issues: Issue[] = [];
  const current = new Map<string, ResolvedTarget>();
  const snapshots = new Map((spec.dependencies ?? []).map((dependency) => [dependency.target, dependency]));
  const targets = [...new Set(spec.steps.map((step) => step.target))];

  for (const target of targets) {
    const resolved = resolveTarget(target);
    if (!resolved) {
      issues.push({ code: "DEPENDENCY_NOT_FOUND", message: `dependency is unavailable: ${target}`, target });
      continue;
    }
    current.set(target, resolved);
    const snapshot = snapshots.get(target);
    if (!snapshot) {
      issues.push({ code: "DEPENDENCY_CHANGED", message: `dependency has no saved fingerprint: ${target}`, target });
      continue;
    }
    if (snapshot.fingerprint === fingerprintTarget(resolved)) continue;
    if ((spec.dependencyPolicy ?? "pinned") === "pinned") {
      issues.push({ code: "DEPENDENCY_CHANGED", message: `pinned dependency changed: ${target}`, target });
      continue;
    }
    const compatibility = checkDependencyContractCompatibility(snapshot, resolved);
    if (compatibility.kind !== "compatible") {
      issues.push({
        code: "DEPENDENCY_CHANGED",
        message: `changed dependency is not statically compatible: ${target}${compatibility.reasons.length ? ` (${compatibility.reasons.join("; ")})` : ""}`,
        target,
      });
    }
  }
  for (const snapshot of snapshots.values()) {
    if (!targets.includes(snapshot.target)) issues.push({ code: "STALE_DEPENDENCY", message: `saved dependency is no longer used: ${snapshot.target}`, target: snapshot.target });
  }
  return { usable: issues.every((item) => item.code === "STALE_DEPENDENCY"), issues, current };
}

export function assertPipelineDependencies(spec: PipelineSpecV1, resolveTarget: TargetResolver): Map<string, ResolvedTarget> {
  const check = checkPipelineDependencies(spec, resolveTarget);
  const fatal = check.issues.find((item) => item.code !== "STALE_DEPENDENCY");
  if (fatal) {
    const code = fatal.code === "DEPENDENCY_NOT_FOUND" ? "DEPENDENCY_NOT_FOUND" : "DEPENDENCY_CHANGED";
    throw new PipelineError(code, fatal.message, { issues: check.issues });
  }
  return check.current;
}

export function snapshotFor(spec: PipelineSpecV1, target: string): DependencySnapshot | undefined {
  return spec.dependencies?.find((dependency) => dependency.target === target);
}
