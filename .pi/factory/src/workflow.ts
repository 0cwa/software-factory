import { createHash } from "node:crypto";
import type {
  Diagnostic,
  GuardDefinition,
  PhaseDefinition,
  TransitionDefinition,
  WorkflowDefinition,
} from "./contracts.js";

export const WORKFLOW_LIMITS = {
  maxPhases: 16,
  maxTransitions: 32,
  maxGuards: 16,
  maxTraversalSteps: 32,
  maxPhaseInputBytes: 256 * 1024,
  maxPhaseOutputBytes: 256 * 1024,
  maxPromptBytes: 128 * 1024,
  maxPromptAggregateBytes: 512 * 1024,
} as const;

export interface WorkflowAssets {
  readonly [path: string]: Uint8Array;
}

export interface WorkflowValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface NormalizedWorkflow {
  readonly workflow: WorkflowDefinition;
  readonly promptAssets: readonly { path: string; bytesBase64: string }[];
  readonly canonicalJson: string;
  readonly digest: string;
}

const PLAN_CHANGE_PHASES = [
  ["request", "request", undefined, undefined, undefined],
  ["scout", "capability", "pi_dev.scout", undefined, undefined],
  ["handoff", "adapter", undefined, "scout_to_architect_request", undefined],
  ["architect", "capability", "pi_dev.architect", undefined, undefined],
  ["gates", "gate", undefined, undefined, undefined],
  ["accepted", "terminal", undefined, undefined, "accepted"],
  ["rejected", "terminal", undefined, undefined, "rejected"],
] as const;
const PLAN_CHANGE_TRANSITIONS = [
  ["request-to-scout", "request", "scout", "always"],
  ["scout-to-handoff", "scout", "handoff", "execution-succeeded"],
  ["handoff-to-architect", "handoff", "architect", "execution-succeeded"],
  ["architect-to-gates", "architect", "gates", "execution-succeeded"],
  ["gates-to-accepted", "gates", "accepted", "acceptance-passed"],
  ["gates-to-rejected", "gates", "rejected", "acceptance-failed"],
] as const;
const PLAN_CHANGE_GUARDS = [
  ["always", "always"], ["execution-succeeded", "execution_succeeded"],
  ["acceptance-passed", "acceptance_passed"], ["acceptance-failed", "acceptance_failed"],
] as const;

export function assertPlanChangeTopology(workflow: WorkflowDefinition): void {
  if (workflow.id !== "plan-change" || workflow.version !== 1 || workflow.entryPhaseId !== "request") throw new Error("Plan-change executor topology admission failed");
  if (workflow.phases.length !== PLAN_CHANGE_PHASES.length || workflow.transitions.length !== PLAN_CHANGE_TRANSITIONS.length || workflow.guards.length !== PLAN_CHANGE_GUARDS.length) throw new Error("Plan-change executor topology admission failed");
  const phaseMap = new Map(workflow.phases.map((phase) => [phase.id, phase]));
  for (const [id, kind, target, adapter, terminalOutcome] of PLAN_CHANGE_PHASES) {
    const phase = phaseMap.get(id);
    if (!phase || phase.kind !== kind || (phase.target ?? undefined) !== target || (phase.adapter ?? undefined) !== adapter || (phase.terminalOutcome ?? undefined) !== terminalOutcome) throw new Error("Plan-change executor topology admission failed");
  }
  const transitionMap = new Map(workflow.transitions.map((transition) => [transition.id, transition]));
  for (const [id, from, to, guard] of PLAN_CHANGE_TRANSITIONS) {
    const transition = transitionMap.get(id);
    if (!transition || transition.from !== from || transition.to !== to || transition.guard !== guard) throw new Error("Plan-change executor topology admission failed");
  }
  const guardMap = new Map(workflow.guards.map((guard) => [guard.id, guard]));
  for (const [id, condition] of PLAN_CHANGE_GUARDS) if (guardMap.get(id)?.condition !== condition) throw new Error("Plan-change executor topology admission failed");
}

const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
const targetPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const fixedTargets = new Set(["pi_dev.scout", "pi_dev.architect"]);
const protocolTargetsByPhase = new Map([["scout", "pi_dev.scout"], ["architect", "pi_dev.architect"]]);
const promptAssetPattern = /^[a-z0-9][a-z0-9._/-]{0,127}\.md$/;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function error(code: string, message: string, phaseId?: string): Diagnostic {
  return phaseId === undefined
    ? { code, message, severity: "error" }
    : { code, message, phaseId, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function reportUnknownFields(value: Record<string, unknown>, allowed: readonly string[], context: string, diagnostics: Diagnostic[]): void {
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedFields.has(key)) diagnostics.push(error("schema.unknown-field", `${context} contains unsupported field ${key}`));
}

function isPhaseKind(value: unknown): value is PhaseDefinition["kind"] {
  return value === "request" || value === "capability" || value === "adapter" || value === "gate" || value === "terminal";
}

function isGuardCondition(value: unknown): value is GuardDefinition["condition"] {
  return value === "always" || value === "execution_succeeded" || value === "acceptance_passed" || value === "acceptance_failed";
}

function assetBytes(assets: WorkflowAssets | ReadonlyMap<string, Uint8Array>, path: string): Uint8Array | undefined {
  return assets instanceof Map ? assets.get(path) : (assets as WorkflowAssets)[path];
}

function uniqueIds<T extends { id: string }>(items: readonly T[], code: string, diagnostics: Diagnostic[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    if (result.has(item.id)) diagnostics.push(error(code, `Duplicate id: ${item.id}`));
    else result.set(item.id, item);
  }
  return result;
}

export function validateWorkflow(
  workflow: unknown,
  assets: WorkflowAssets | ReadonlyMap<string, Uint8Array> = {},
): WorkflowValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(workflow)) return { valid: false, diagnostics: [error("workflow.invalid", "Workflow must be an object")] };

  reportUnknownFields(workflow, ["id", "version", "entryPhaseId", "maxTraversalSteps", "phases", "transitions", "guards"], "workflow", diagnostics);
  const phases = workflow.phases;
  const transitions = workflow.transitions;
  const guards = workflow.guards;
  if (typeof workflow.id !== "string" || !idPattern.test(workflow.id)) diagnostics.push(error("workflow.id", "Workflow id is invalid"));
  if (!isIntegerInRange(workflow.version, 1, 999)) diagnostics.push(error("workflow.version", "Workflow version must be a positive integer"));
  if (typeof workflow.entryPhaseId !== "string") diagnostics.push(error("workflow.entry", "Workflow entryPhaseId is required"));
  if (!isIntegerInRange(workflow.maxTraversalSteps, 1, WORKFLOW_LIMITS.maxTraversalSteps)) {
    diagnostics.push(error("workflow.bounds", `maxTraversalSteps must be between 1 and ${WORKFLOW_LIMITS.maxTraversalSteps}`));
  }
  if (!Array.isArray(phases) || phases.length === 0 || phases.length > WORKFLOW_LIMITS.maxPhases) {
    diagnostics.push(error("workflow.phases", `phases must contain 1-${WORKFLOW_LIMITS.maxPhases} items`));
  }
  if (!Array.isArray(transitions) || transitions.length === 0 || transitions.length > WORKFLOW_LIMITS.maxTransitions) {
    diagnostics.push(error("workflow.transitions", `transitions must contain 1-${WORKFLOW_LIMITS.maxTransitions} items`));
  }
  if (!Array.isArray(guards) || guards.length === 0 || guards.length > WORKFLOW_LIMITS.maxGuards) {
    diagnostics.push(error("workflow.guards", `guards must contain 1-${WORKFLOW_LIMITS.maxGuards} items`));
  }
  if (!Array.isArray(phases) || !Array.isArray(transitions) || !Array.isArray(guards)) {
    return { valid: diagnostics.length === 0, diagnostics };
  }

  const phaseItems: PhaseDefinition[] = [];
  for (const [index, candidate] of phases.entries()) {
    if (!isRecord(candidate)) {
      diagnostics.push(error("phase.invalid", `Phase ${index} must be an object`));
      continue;
    }
    reportUnknownFields(candidate, ["id", "kind", "label", "target", "adapter", "promptAsset", "maxInputBytes", "maxOutputBytes", "terminalOutcome"], `Phase ${index}`, diagnostics);
    const phase = candidate as unknown as Partial<PhaseDefinition>;
    if (typeof phase.id !== "string" || !idPattern.test(phase.id)) diagnostics.push(error("phase.id", `Phase ${index} has an invalid id`));
    if (!isPhaseKind(phase.kind)) diagnostics.push(error("phase.kind", `Phase ${phase.id ?? index} has an invalid kind`));
    if (typeof phase.label !== "string" || phase.label.length === 0 || phase.label.length > 256) diagnostics.push(error("phase.label", `Phase ${phase.id ?? index} has an invalid label`));
    if (!isIntegerInRange(phase.maxInputBytes, 1, WORKFLOW_LIMITS.maxPhaseInputBytes)) diagnostics.push(error("phase.input-bound", `Phase ${phase.id ?? index} has an invalid maxInputBytes`));
    if (!isIntegerInRange(phase.maxOutputBytes, 1, WORKFLOW_LIMITS.maxPhaseOutputBytes)) diagnostics.push(error("phase.output-bound", `Phase ${phase.id ?? index} has an invalid maxOutputBytes`));
    if (phase.kind === "terminal" && phase.terminalOutcome !== "accepted" && phase.terminalOutcome !== "rejected") diagnostics.push(error("phase.terminal", `Terminal phase ${phase.id ?? index} needs an accepted or rejected outcome`));
    if (phase.kind !== "terminal" && phase.terminalOutcome !== undefined) diagnostics.push(error("phase.terminal", `Non-terminal phase ${phase.id ?? index} cannot have a terminal outcome`));
    if (phase.kind === "capability" && typeof phase.target !== "string") diagnostics.push(error("phase.target", `Phase ${phase.id ?? index} needs a fixed target`));
    if (phase.kind === "adapter" && phase.adapter !== "scout_to_architect_request") diagnostics.push(error("phase.adapter", `Phase ${phase.id ?? index} needs the package-owned scout_to_architect_request adapter`));
    if (phase.adapter !== undefined && phase.adapter !== "scout_to_architect_request") diagnostics.push(error("phase.adapter", `Phase ${phase.id ?? index} has an unsupported local adapter`));
    if (phase.target !== undefined && (typeof phase.target !== "string" || !targetPattern.test(phase.target) || !fixedTargets.has(phase.target))) diagnostics.push(error("phase.target", `Phase ${phase.id ?? index} has an unsupported dynamic or exact target`));
    if (phase.target !== undefined && (phase.kind !== "capability" || (typeof phase.id === "string" && protocolTargetsByPhase.get(phase.id) !== phase.target))) diagnostics.push(error("phase.target-kind", `Phase ${phase.id ?? index} cannot declare that Protocol target`));
    if (phase.adapter !== undefined && phase.kind !== "adapter") diagnostics.push(error("phase.adapter-kind", `Phase ${phase.id ?? index} cannot declare a local adapter`));
    if (phase.kind === "adapter" && phase.target !== undefined) diagnostics.push(error("phase.target-kind", `Adapter phase ${phase.id ?? index} cannot declare a Protocol target`));
    if (phase.kind === "capability" && typeof phase.promptAsset !== "string") diagnostics.push(error("phase.prompt", `Phase ${phase.id ?? index} needs a prompt asset`));
    if (phase.promptAsset !== undefined && (typeof phase.promptAsset !== "string" || !promptAssetPattern.test(phase.promptAsset))) diagnostics.push(error("phase.prompt", `Phase ${phase.id ?? index} has an invalid prompt asset`));
    if (phase.promptAsset !== undefined && phase.kind !== "capability") diagnostics.push(error("phase.prompt-kind", `Phase ${phase.id ?? index} cannot declare a prompt asset`));
    if (typeof phase.id === "string" && typeof phase.kind === "string" && typeof phase.label === "string" && typeof phase.maxInputBytes === "number" && typeof phase.maxOutputBytes === "number") {
      phaseItems.push(phase as PhaseDefinition);
    }
  }
  const phaseMap = uniqueIds(phaseItems, "phase.duplicate", diagnostics);

  const guardItems: GuardDefinition[] = [];
  for (const [index, candidate] of guards.entries()) {
    if (!isRecord(candidate)) {
      diagnostics.push(error("guard.invalid", `Guard ${index} is invalid`));
      continue;
    }
    reportUnknownFields(candidate, ["id", "condition"], `Guard ${index}`, diagnostics);
    if (typeof candidate.id !== "string" || !idPattern.test(candidate.id) || !isGuardCondition(candidate.condition)) {
      diagnostics.push(error("guard.invalid", `Guard ${index} is invalid`));
      continue;
    }
    guardItems.push(candidate as unknown as GuardDefinition);
  }
  const guardMap = uniqueIds(guardItems, "guard.duplicate", diagnostics);

  const transitionItems: TransitionDefinition[] = [];
  for (const [index, candidate] of transitions.entries()) {
    if (!isRecord(candidate)) {
      diagnostics.push(error("transition.invalid", `Transition ${index} is invalid`));
      continue;
    }
    reportUnknownFields(candidate, ["id", "from", "to", "guard"], `Transition ${index}`, diagnostics);
    if (typeof candidate.id !== "string" || !idPattern.test(candidate.id) || typeof candidate.from !== "string" || typeof candidate.to !== "string" || typeof candidate.guard !== "string") {
      diagnostics.push(error("transition.invalid", `Transition ${index} is invalid`));
      continue;
    }
    transitionItems.push(candidate as unknown as TransitionDefinition);
    if (!phaseMap.has(candidate.from)) diagnostics.push(error("transition.from", `Transition ${candidate.id} references missing phase ${candidate.from}`));
    if (!phaseMap.has(candidate.to)) diagnostics.push(error("transition.to", `Transition ${candidate.id} references missing phase ${candidate.to}`));
    if (!guardMap.has(candidate.guard)) diagnostics.push(error("transition.guard", `Transition ${candidate.id} references missing guard ${candidate.guard}`));
  }
  const transitionMap = uniqueIds(transitionItems, "transition.duplicate", diagnostics);

  const entry = typeof workflow.entryPhaseId === "string" ? phaseMap.get(workflow.entryPhaseId) : undefined;
  if (!entry) diagnostics.push(error("workflow.entry", "Entry phase is missing"));
  const requestPhases = phaseItems.filter((phase) => phase.kind === "request");
  if (requestPhases.length !== 1) diagnostics.push(error("workflow.entry-count", "Workflow must contain exactly one request phase"));
  if (entry && entry.kind !== "request") diagnostics.push(error("workflow.entry-kind", "Entry phase must be the request phase"));
  const terminals = phaseItems.filter((phase) => phase.kind === "terminal");
  if (!terminals.some((phase) => phase.terminalOutcome === "accepted")) diagnostics.push(error("workflow.accepted-terminal", "Accepted terminal is required"));
  if (!terminals.some((phase) => phase.terminalOutcome === "rejected")) diagnostics.push(error("workflow.rejected-terminal", "Rejected terminal is required"));

  const outgoing = new Map<string, TransitionDefinition[]>();
  for (const transition of transitionItems) {
    const list = outgoing.get(transition.from) ?? [];
    list.push(transition);
    outgoing.set(transition.from, list);
  }
  for (const phase of phaseItems) {
    const edges = outgoing.get(phase.id) ?? [];
    if (phase.kind !== "terminal" && edges.length === 0) diagnostics.push(error("phase.dead-end", `Non-terminal phase ${phase.id} has no outgoing transition`, phase.id));
    if (phase.kind === "terminal" && edges.length > 0) diagnostics.push(error("phase.terminal-outgoing", `Terminal phase ${phase.id} cannot have outgoing transitions`, phase.id));
    const expectedConditions: readonly GuardDefinition["condition"][] = phase.kind === "request"
      ? ["always"]
      : phase.kind === "capability" || phase.kind === "adapter"
        ? ["execution_succeeded"]
        : phase.kind === "gate"
          ? ["acceptance_passed", "acceptance_failed"]
          : [];
    const actualConditions = edges.map((edge) => guardMap.get(edge.guard)?.condition);
    if (edges.length !== expectedConditions.length || expectedConditions.some((condition) => actualConditions.filter((actual) => actual === condition).length !== 1)) {
      diagnostics.push(error("transition.ambiguous", `Phase ${phase.id} must have exactly one transition for each of: ${expectedConditions.join(", ") || "none"}`, phase.id));
    }
    const seenGuards = new Set<string>();
    for (const edge of edges) {
      if (seenGuards.has(edge.guard)) diagnostics.push(error("transition.ambiguous", `Phase ${phase.id} has duplicate guard ${edge.guard}`, phase.id));
      seenGuards.add(edge.guard);
    }
  }
  for (const phase of phaseItems) {
    if (phase.promptAsset !== undefined) {
      const bytes = assetBytes(assets, phase.promptAsset);
      if (!bytes) diagnostics.push(error("phase.prompt-missing", `Prompt asset is missing: ${phase.promptAsset}`, phase.id));
      else if (bytes.byteLength > WORKFLOW_LIMITS.maxPromptBytes) diagnostics.push(error("phase.prompt-bound", `Prompt asset exceeds ${WORKFLOW_LIMITS.maxPromptBytes} bytes`, phase.id));
    }
  }

  if (entry) {
    const reachable = new Set<string>();
    const pending = [entry.id];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of outgoing.get(current) ?? []) pending.push(edge.to);
    }
    for (const phase of phaseItems) if (!reachable.has(phase.id)) diagnostics.push(error("phase.unreachable", `Phase ${phase.id} is unreachable`, phase.id));

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (phaseId: string): void => {
      if (visiting.has(phaseId)) {
        diagnostics.push(error("workflow.cycle", `Cycle detected at phase ${phaseId}`, phaseId));
        return;
      }
      if (visited.has(phaseId)) return;
      visiting.add(phaseId);
      for (const edge of outgoing.get(phaseId) ?? []) if (phaseMap.has(edge.to)) visit(edge.to);
      visiting.delete(phaseId);
      visited.add(phaseId);
    };
    visit(entry.id);

    const longestPath = (phaseId: string, path: Set<string>): number => {
      if (path.has(phaseId)) return Number.POSITIVE_INFINITY;
      const edges = outgoing.get(phaseId) ?? [];
      if (edges.length === 0) return 1;
      const nextPath = new Set(path).add(phaseId);
      return 1 + Math.max(...edges.map((edge) => phaseMap.has(edge.to) ? longestPath(edge.to, nextPath) : Number.POSITIVE_INFINITY));
    };
    if (typeof workflow.maxTraversalSteps === "number" && longestPath(entry.id, new Set()) > workflow.maxTraversalSteps) {
      diagnostics.push(error("workflow.traversal-bound", "A reachable path exceeds maxTraversalSteps"));
    }
  }
  // Referencing the map keeps duplicate transition validation meaningful even when all edges are malformed.
  if (transitionMap.size !== transitionItems.length) diagnostics.push(error("transition.duplicate", "Transition ids must be unique"));
  return { valid: diagnostics.length === 0, diagnostics };
}

function sortedPhase(phase: PhaseDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: phase.id,
    kind: phase.kind,
    label: phase.label,
    maxInputBytes: phase.maxInputBytes,
    maxOutputBytes: phase.maxOutputBytes,
  };
  if (phase.target !== undefined) result.target = phase.target;
  if (phase.adapter !== undefined) result.adapter = phase.adapter;
  if (phase.promptAsset !== undefined) result.promptAsset = phase.promptAsset;
  if (phase.terminalOutcome !== undefined) result.terminalOutcome = phase.terminalOutcome;
  return result;
}

export function normalizeWorkflow(
  workflow: WorkflowDefinition,
  assets: WorkflowAssets | ReadonlyMap<string, Uint8Array>,
): NormalizedWorkflow {
  const result = validateWorkflow(workflow, assets);
  if (!result.valid) throw new Error(result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("; "));
  const promptPaths = [...new Set(workflow.phases.flatMap((phase) => phase.promptAsset === undefined ? [] : [phase.promptAsset]))].sort(compareStrings);
  const normalizedWorkflow = {
    id: workflow.id,
    version: workflow.version,
    entryPhaseId: workflow.entryPhaseId,
    maxTraversalSteps: workflow.maxTraversalSteps,
    phases: [...workflow.phases].sort((a, b) => compareStrings(a.id, b.id)).map(sortedPhase),
    transitions: [...workflow.transitions].sort((a, b) => compareStrings(a.id, b.id)).map((transition) => ({ id: transition.id, from: transition.from, to: transition.to, guard: transition.guard })),
    guards: [...workflow.guards].sort((a, b) => compareStrings(a.id, b.id)).map((guard) => ({ id: guard.id, condition: guard.condition })),
  };
  const promptAssets = promptPaths.map((path) => {
    const bytes = assetBytes(assets, path);
    if (!bytes) throw new Error(`Prompt asset is missing: ${path}`);
    return { path, bytesBase64: Buffer.from(bytes).toString("base64") };
  });
  const canonicalJson = JSON.stringify({ workflow: normalizedWorkflow, promptAssets });
  const digest = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  return { workflow: normalizedWorkflow as unknown as WorkflowDefinition, promptAssets, canonicalJson, digest };
}

export function digestWorkflow(workflow: WorkflowDefinition, assets: WorkflowAssets | ReadonlyMap<string, Uint8Array>): string {
  return normalizeWorkflow(workflow, assets).digest;
}

function escapeHumanText(value: unknown): string {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`);
}

function textGuard(condition: string): string {
  return escapeHumanText(condition.replaceAll("_", " "));
}

export function renderWorkflowText(normalized: NormalizedWorkflow): string {
  const lines = [`workflow ${escapeHumanText(normalized.workflow.id)}@${escapeHumanText(normalized.workflow.version)} (${normalized.digest})`, `entry: ${escapeHumanText(normalized.workflow.entryPhaseId)}`, `max traversal steps: ${escapeHumanText(normalized.workflow.maxTraversalSteps)}`, "phases:"];
  for (const phase of normalized.workflow.phases) {
    const target = phase.target === undefined ? "" : ` target=${escapeHumanText(phase.target)}`;
    const outcome = phase.terminalOutcome === undefined ? "" : ` outcome=${escapeHumanText(phase.terminalOutcome)}`;
    lines.push(`- ${escapeHumanText(phase.id)} [${escapeHumanText(phase.kind)}] ${escapeHumanText(phase.label)}${target}${outcome}`);
  }
  lines.push("transitions:");
  const guardConditions = new Map(normalized.workflow.guards.map((guard) => [guard.id, guard.condition]));
  for (const transition of normalized.workflow.transitions) lines.push(`- ${escapeHumanText(transition.from)} -> ${escapeHumanText(transition.to)} [${textGuard(guardConditions.get(transition.guard) ?? transition.guard)}]`);
  lines.push("prompt assets:");
  for (const asset of normalized.promptAssets) lines.push(`- ${escapeHumanText(asset.path)} (${Buffer.from(asset.bytesBase64, "base64").byteLength} bytes)`);
  return `${lines.join("\n")}\n`;
}

function mermaidId(id: string): string {
  return `p_${id.replaceAll("-", "_")}`;
}

export function renderWorkflowMermaid(normalized: NormalizedWorkflow): string {
  const lines = ["flowchart TD"];
  for (const phase of normalized.workflow.phases) {
    const label = phase.terminalOutcome === undefined ? phase.label : `${phase.label} (${phase.terminalOutcome})`;
    lines.push(`  ${mermaidId(phase.id)}[\"${escapeHumanText(label).replaceAll('"', "'")}\"]`);
  }
  const conditions = new Map(normalized.workflow.guards.map((guard) => [guard.id, guard.condition]));
  for (const transition of normalized.workflow.transitions) {
    const condition = conditions.get(transition.guard) ?? transition.guard;
    lines.push(`  ${mermaidId(transition.from)} -->|${escapeHumanText(condition)}| ${mermaidId(transition.to)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function assertValidWorkflow(workflow: unknown, assets: WorkflowAssets | ReadonlyMap<string, Uint8Array> = {}): asserts workflow is WorkflowDefinition {
  const result = validateWorkflow(workflow, assets);
  if (!result.valid) throw new Error(result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("; "));
}
