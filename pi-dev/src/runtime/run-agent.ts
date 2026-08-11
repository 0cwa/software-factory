import type { ProtocolProvideContract } from "@kybernetria/pi-protocol/contract";
import type { AgentOutputBase, AgentRequestBase } from "../types.ts";
import type { AgentDefinition } from "./definition.ts";

const DEFAULT_MAX_PROMPT_CHARS = 64_000;
const DEFAULT_MAX_RESPONSE_CHARS = 256_000;

export interface PrepareAgentInputOptions {
  maxPromptChars?: number;
  maxResponseChars?: number;
}

export interface PreparedAgentInput<Request extends AgentRequestBase = AgentRequestBase> {
  role: string;
  request: Request;
  prompt: string;
  diagnostics: string[];
  maxResponseChars: number;
}

export function prepareAgentInput<Request extends AgentRequestBase, Output extends AgentOutputBase>(
  definition: AgentDefinition<Request, Output>,
  request: Request,
  provide: ProtocolProvideContract,
  options: PrepareAgentInputOptions = {},
): PreparedAgentInput<Request> {
  validateBaseRequest(request);
  const diagnostics: string[] = [];
  const promptLimit = options.maxPromptChars ?? envPositiveInt("PI_DEV_MAX_PROMPT_CHARS", DEFAULT_MAX_PROMPT_CHARS);
  const promptData = {
    task: request.task,
    context: request.context ?? "",
    roleDetails: definition.buildTaskDetails(request),
    outputContract: provide.outputSchema,
  };
  const serialized = JSON.stringify(promptData, null, 2);
  const promptTruncation = truncate(serialized, promptLimit);
  if (promptTruncation.truncated) diagnostics.push(`Model prompt was truncated to ${promptLimit} characters.`);
  const prompt = `Complete this request in the host session working directory. Return only valid JSON matching outputContract.\n${promptTruncation.text}\n${promptTruncation.truncated ? `[DIAGNOSTIC: input was truncated at ${promptLimit} characters; report this in diagnostics.]` : ""}`;

  return {
    role: definition.role,
    request,
    prompt,
    diagnostics,
    maxResponseChars: options.maxResponseChars ?? envPositiveInt("PI_DEV_MAX_RESPONSE_CHARS", DEFAULT_MAX_RESPONSE_CHARS),
  };
}

export function parseAgentOutput<Output extends AgentOutputBase>(
  raw: string,
  prepared: PreparedAgentInput,
): Output {
  if (raw.length > prepared.maxResponseChars) {
    throw new Error(`Agent output exceeded ${prepared.maxResponseChars} characters; structured output cannot be trusted.`);
  }
  const parsed = parseJsonObject(raw) as Output;
  if (prepared.diagnostics.length > 0) {
    if (!Array.isArray(parsed.diagnostics) || typeof parsed.message !== "string") {
      throw new Error(`${prepared.role} agent output cannot carry required truncation diagnostics`);
    }
    parsed.diagnostics.push(...prepared.diagnostics);
    parsed.message = `${parsed.message} (${prepared.diagnostics.join(" ")})`;
  }
  return parsed;
}

function validateBaseRequest(request: AgentRequestBase): void {
  if (!request || typeof request !== "object") throw new Error("agent request must be an object");
  if (typeof request.task !== "string" || !request.task.trim()) throw new Error("task must be a non-empty string");
  if (request.context !== undefined && typeof request.context !== "string") throw new Error("context must be a string");
}

function parseJsonObject(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced) candidates.unshift(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {}
  }
  throw new Error("agent returned invalid JSON output");
}

function truncate(value: string, limit: number): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: `${value.slice(0, Math.max(0, limit - 32))}\n...[truncated]`, truncated: true };
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}
