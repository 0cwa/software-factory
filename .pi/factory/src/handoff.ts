import type { ArchitectRequest, ScoutOutput } from "./contracts.js";

export const HANDOFF_LIMITS = {
  maxContextChars: 16_384,
  maxTaskChars: 65_536,
  maxConstraints: 32,
  maxConstraintChars: 2_048,
  maxFindings: 64,
  maxFindingChars: 2_048,
  maxFiles: 64,
  maxCodePaths: 64,
  maxUnresolvedQuestions: 32,
  maxDiagnostics: 64,
  maxArtifactChars: 2_048,
  maxMessageChars: 2_048,
} as const;

const SCOUT_FIELDS = ["summary", "files", "codePaths", "findings", "unresolvedQuestions", "diagnostics", "message"] as const;
const SCOUT_FILE_FIELDS = ["path", "line", "relevance"] as const;
const SCOUT_CODE_PATH_FIELDS = ["from", "to", "relationship"] as const;
const BEGIN_UNTRUSTED_SCOUT_EVIDENCE = "--- BEGIN UNTRUSTED SCOUT EVIDENCE ---";
const END_UNTRUSTED_SCOUT_EVIDENCE = "--- END UNTRUSTED SCOUT EVIDENCE ---";
const UNTRUSTED_EVIDENCE_DELIMITERS = [BEGIN_UNTRUSTED_SCOUT_EVIDENCE, END_UNTRUSTED_SCOUT_EVIDENCE] as const;

export interface ScoutToArchitectInput {
  readonly requestId: string;
  readonly task: string;
  readonly scout: ScoutOutput;
  readonly constraints?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) throw new TypeError(`${name} contains unsupported field ${key}`);
}

function rejectDelimiterCollision(value: string, name: string): void {
  if (UNTRUSTED_EVIDENCE_DELIMITERS.some((delimiter) => value.includes(delimiter))) {
    throw new TypeError(`${name} contains an untrusted-evidence delimiter`);
  }
}

function normalizedText(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  if (value.length > maximum) throw new RangeError(`${name} exceeds ${maximum} characters`);
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  rejectDelimiterCollision(normalized, name);
  return normalized;
}

function boundedList(values: readonly unknown[] | undefined, name: string, maxItems: number, maxChars: number): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  if (values.length > maxItems) throw new RangeError(`${name} exceeds ${maxItems} items`);
  return values.map((value, index) => normalizedText(value, `${name}[${index}]`, maxChars));
}

function appendBounded(lines: string[], line: string, maximum: number): boolean {
  const addition = lines.length === 0 ? line : `\n${line}`;
  const current = lines.join("\n");
  if (current.length + addition.length <= maximum) {
    lines.push(line);
    return true;
  }
  if (current.length + (lines.length === 0 ? 0 : 1) + "[truncated]".length <= maximum) lines.push("[truncated]");
  return false;
}

function artifactLine(path: string, line: number | undefined, relevance: string): string {
  const location = line === undefined ? path : `${path}:${line}`;
  return `${location} — ${relevance}`;
}

function validateScoutOutput(value: unknown): asserts value is ScoutOutput {
  if (!isRecord(value)) throw new TypeError("scout output must be an object");
  rejectUnknownFields(value, SCOUT_FIELDS, "scout output");
  for (const field of SCOUT_FIELDS) if (!(field in value)) throw new TypeError(`scout output is missing ${field}`);
  if (!Array.isArray(value.files) || !Array.isArray(value.codePaths)) throw new TypeError("scout output has invalid reference lists");
  if (value.files.length > HANDOFF_LIMITS.maxFiles) throw new RangeError(`scout.files exceeds ${HANDOFF_LIMITS.maxFiles} items`);
  if (value.codePaths.length > HANDOFF_LIMITS.maxCodePaths) throw new RangeError(`scout.codePaths exceeds ${HANDOFF_LIMITS.maxCodePaths} items`);
  for (const [index, file] of value.files.entries()) {
    if (!isRecord(file)) throw new TypeError(`scout.files[${index}] has an invalid shape`);
    rejectUnknownFields(file, SCOUT_FILE_FIELDS, `scout.files[${index}]`);
    if (typeof file.path !== "string" || typeof file.relevance !== "string") throw new TypeError(`scout.files[${index}] has an invalid shape`);
    if (file.line !== undefined && (!Number.isInteger(file.line) || (file.line as number) < 1)) throw new RangeError(`scout.files[${index}].line is invalid`);
  }
  for (const [index, path] of value.codePaths.entries()) {
    if (!isRecord(path)) throw new TypeError(`scout.codePaths[${index}] has an invalid shape`);
    rejectUnknownFields(path, SCOUT_CODE_PATH_FIELDS, `scout.codePaths[${index}]`);
    if (typeof path.from !== "string" || typeof path.to !== "string" || typeof path.relationship !== "string") throw new TypeError(`scout.codePaths[${index}] has an invalid shape`);
  }
  normalizedText(value.summary, "scout.summary", HANDOFF_LIMITS.maxFindingChars);
  boundedList(value.findings as unknown[], "scout.findings", HANDOFF_LIMITS.maxFindings, HANDOFF_LIMITS.maxFindingChars);
  boundedList(value.unresolvedQuestions as unknown[], "scout.unresolvedQuestions", HANDOFF_LIMITS.maxUnresolvedQuestions, HANDOFF_LIMITS.maxFindingChars);
  boundedList(value.diagnostics as unknown[], "scout.diagnostics", HANDOFF_LIMITS.maxDiagnostics, HANDOFF_LIMITS.maxFindingChars);
  normalizedText(value.message, "scout.message", HANDOFF_LIMITS.maxMessageChars);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function formatScoutToArchitectRequest(input: ScoutToArchitectInput): ArchitectRequest {
  const requestId = normalizedText(input.requestId, "requestId", 256);
  const task = normalizedText(input.task, "task", HANDOFF_LIMITS.maxTaskChars);
  validateScoutOutput(input.scout);
  const summary = normalizedText(input.scout.summary, "scout.summary", HANDOFF_LIMITS.maxFindingChars);
  const findings = boundedList(input.scout.findings, "scout.findings", HANDOFF_LIMITS.maxFindings, HANDOFF_LIMITS.maxFindingChars);
  const unresolved = boundedList(input.scout.unresolvedQuestions, "scout.unresolvedQuestions", HANDOFF_LIMITS.maxUnresolvedQuestions, HANDOFF_LIMITS.maxFindingChars);
  const constraints = boundedList(input.constraints, "constraints", HANDOFF_LIMITS.maxConstraints, HANDOFF_LIMITS.maxConstraintChars);

  const files = input.scout.files.map((file, index) => artifactLine(
    normalizedText(file.path, `scout.files[${index}].path`, HANDOFF_LIMITS.maxArtifactChars),
    file.line as number | undefined,
    normalizedText(file.relevance, `scout.files[${index}].relevance`, HANDOFF_LIMITS.maxArtifactChars),
  )).sort(compareCodeUnits);
  const codePaths = input.scout.codePaths.map((path, index) => `${normalizedText(path.from, `scout.codePaths[${index}].from`, HANDOFF_LIMITS.maxArtifactChars)} -> ${normalizedText(path.to, `scout.codePaths[${index}].to`, HANDOFF_LIMITS.maxArtifactChars)} (${normalizedText(path.relationship, `scout.codePaths[${index}].relationship`, HANDOFF_LIMITS.maxArtifactChars)})`).sort(compareCodeUnits);

  const lines: string[] = [
    `request-id: ${requestId}`,
    BEGIN_UNTRUSTED_SCOUT_EVIDENCE,
    `scout-summary: ${summary}`,
  ];
  const evidenceMaximum = HANDOFF_LIMITS.maxContextChars - END_UNTRUSTED_SCOUT_EVIDENCE.length - 1;
  if (findings.length > 0) {
    appendBounded(lines, "findings:", evidenceMaximum);
    for (const finding of findings) if (!appendBounded(lines, `- ${finding}`, evidenceMaximum)) break;
  }
  if (files.length > 0) {
    appendBounded(lines, "artifact-references:", evidenceMaximum);
    for (const file of files) if (!appendBounded(lines, `- ${file}`, evidenceMaximum)) break;
  }
  if (codePaths.length > 0) {
    appendBounded(lines, "code-paths:", evidenceMaximum);
    for (const path of codePaths) if (!appendBounded(lines, `- ${path}`, evidenceMaximum)) break;
  }
  if (unresolved.length > 0) {
    appendBounded(lines, "unresolved-questions:", evidenceMaximum);
    for (const question of unresolved) if (!appendBounded(lines, `- ${question}`, evidenceMaximum)) break;
  }
  lines.push(END_UNTRUSTED_SCOUT_EVIDENCE);
  return constraints.length > 0
    ? { task, context: lines.join("\n"), constraints }
    : { task, context: lines.join("\n") };
}

export const formatScoutHandoff = formatScoutToArchitectRequest;
