import { PipelineError } from "../errors.ts";
import { generatedTarget } from "../schemas.ts";
import type { PipelineSpecV1 } from "../types.ts";

export function findPipelineCycles(specs: Iterable<PipelineSpecV1>): string[][] {
  const byTarget = new Map<string, PipelineSpecV1>();
  for (const spec of specs) {
    const target = generatedTarget(spec.id);
    if (byTarget.has(target)) throw new PipelineError("PIPELINE_CYCLE", `duplicate generated target ${target}`, { target });
    byTarget.set(target, spec);
  }
  const edges = new Map<string, string[]>();
  for (const [target, spec] of byTarget) {
    edges.set(target, [...new Set(spec.steps.map((step) => step.target).filter((dependency) => byTarget.has(dependency)))]);
  }

  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const keys = [...byTarget.keys()].sort();
  for (const target of keys) if (!color.get(target)) visit(target);
  return deduplicateCycles(cycles);

  function visit(target: string): void {
    color.set(target, 1);
    stack.push(target);
    for (const dependency of (edges.get(target) ?? []).slice().sort()) {
      if (!color.get(dependency)) visit(dependency);
      else if (color.get(dependency) === 1) {
        const start = stack.indexOf(dependency);
        cycles.push([...stack.slice(start), dependency]);
      }
    }
    stack.pop();
    color.set(target, 2);
  }
}

export function assertPipelinesAcyclic(specs: Iterable<PipelineSpecV1>): void {
  const cycles = findPipelineCycles(specs);
  if (cycles.length > 0) {
    const path = cycles[0];
    throw new PipelineError("PIPELINE_CYCLE", `pipeline cycle detected: ${path.join(" -> ")}`, { path, cycles });
  }
}

export function cycleTargets(cycles: string[][]): Set<string> {
  return new Set(cycles.flatMap((cycle) => cycle.slice(0, -1)));
}

function deduplicateCycles(cycles: string[][]): string[][] {
  const found = new Map<string, string[]>();
  for (const cycle of cycles) {
    const ring = cycle.slice(0, -1);
    if (ring.length === 0) continue;
    const rotations = ring.map((_, index) => [...ring.slice(index), ...ring.slice(0, index)]);
    const canonical = rotations.map((items) => items.join("\u0000")).sort()[0];
    if (!found.has(canonical)) {
      const normalized = canonical.split("\u0000");
      found.set(canonical, [...normalized, normalized[0]]);
    }
  }
  return [...found.values()].sort((left, right) => left.join(".").localeCompare(right.join(".")));
}
