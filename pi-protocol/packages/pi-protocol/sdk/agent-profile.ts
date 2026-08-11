import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { assertBoundedJsonValue, parseJsonSource } from "../contract/json.ts";
import { PROTOCOL_CONTRACT_LIMITS } from "../contract/limits.ts";
import { normalizeJsonValue } from "../contract/normalize.ts";
import { STANDARD_EFFECTS, type JsonValue, type ProtocolDefinition } from "../contract/types.ts";
import type { ProtocolGrant } from "../types.ts";

export interface PiAgentModelPolicy {
  readonly class?: "fast" | "balanced" | "reasoning";
  readonly specific?: string;
  readonly thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface PiAgentContinuationPolicy {
  readonly ttlMs?: number;
  readonly maxSessions?: number;
}

export interface PiAgentProfile {
  readonly prompt: string;
  readonly tools?: readonly string[];
  readonly modelPolicy?: PiAgentModelPolicy;
  readonly protocolAccess?: ProtocolGrant;
  readonly continuation?: PiAgentContinuationPolicy;
}

export interface PiAgentProfilesFile {
  readonly schemaVersion: 1;
  readonly agents: Readonly<Record<string, PiAgentProfile>>;
}

export interface ResolvedPiAgentProfile extends PiAgentProfile {
  readonly promptText: string;
}

export interface ResolvedPiAgentProfiles {
  readonly schemaVersion: 1;
  readonly agents: Readonly<Record<string, ResolvedPiAgentProfile>>;
}

export interface PiAgentProvideBindings {
  readonly [provideName: string]: string;
}

export function parsePiAgentProfiles(source: string | unknown): PiAgentProfilesFile {
  const value = typeof source === "string"
    ? parseJsonSource(source, PROTOCOL_CONTRACT_LIMITS)
    : assertBoundedJsonValue(source, PROTOCOL_CONTRACT_LIMITS);
  if (!plain(value)) throw new Error("pi.agents.json must be an object");
  exact(value, ["schemaVersion", "agents"], "pi.agents.json");
  if (value.schemaVersion !== 1 || !plain(value.agents)) throw new Error("pi.agents.json schemaVersion and agents are required");
  if (Object.keys(value.agents).length > 128) throw new Error("pi.agents.json has too many agents");
  for (const [name, profile] of Object.entries(value.agents)) validateProfile(name, profile);
  return normalizeJsonValue(value as JsonValue) as unknown as PiAgentProfilesFile;
}

export function resolvePiAgentProfiles(profiles: PiAgentProfilesFile, baseDir: string): ResolvedPiAgentProfiles {
  const realBase = realpathSync(baseDir);
  const agents = Object.fromEntries(Object.entries(profiles.agents).map(([name, profile]) => {
    const candidate = resolve(realBase, profile.prompt);
    if (!within(realBase, candidate)) throw new Error(`Agent ${name} prompt escapes profile base directory`);
    const realPrompt = realpathSync(candidate);
    if (!within(realBase, realPrompt) || !statSync(realPrompt).isFile()) throw new Error(`Agent ${name} prompt must be a contained file`);
    const promptText = readFileSync(realPrompt, "utf8");
    if (Buffer.byteLength(promptText, "utf8") > 262_144) throw new Error(`Agent ${name} prompt exceeds size limit`);
    return [name, Object.freeze({ ...profile, promptText })];
  }));
  return Object.freeze({ schemaVersion: 1, agents: Object.freeze(agents) });
}

export function validateAgentProvideBindings(
  definition: ProtocolDefinition,
  profiles: ResolvedPiAgentProfiles,
  bindings: PiAgentProvideBindings,
): void {
  const provides = new Set(definition.manifest.provides.map((provide) => provide.name));
  for (const [provide, agent] of Object.entries(bindings)) {
    if (!provides.has(provide)) throw new Error(`Agent binding references undeclared provide ${provide}`);
    if (!profiles.agents[agent]) throw new Error(`Agent binding references undeclared private agent ${agent}`);
  }
}

function validateProfile(name: string, value: unknown): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(name) || !plain(value)) throw new Error(`Invalid agent profile ${name}`);
  exact(value, ["prompt", "tools", "modelPolicy", "protocolAccess", "continuation"], `agents.${name}`);
  if (typeof value.prompt !== "string" || !value.prompt || value.prompt.length > 512 || isAbsolute(value.prompt)) throw new Error(`Agent ${name} prompt must be a relative path`);
  if (value.tools !== undefined) stringArray(value.tools, 64, `agents.${name}.tools`);
  if (value.modelPolicy !== undefined) {
    if (!plain(value.modelPolicy)) throw new Error(`agents.${name}.modelPolicy must be an object`);
    exact(value.modelPolicy, ["class", "specific", "thinkingLevel"], `agents.${name}.modelPolicy`);
    if (value.modelPolicy.class !== undefined && !["fast", "balanced", "reasoning"].includes(String(value.modelPolicy.class))) throw new Error(`Invalid model class for ${name}`);
    if (value.modelPolicy.specific !== undefined && (typeof value.modelPolicy.specific !== "string" || value.modelPolicy.specific.length > 256)) throw new Error(`Invalid model override for ${name}`);
    if (value.modelPolicy.thinkingLevel !== undefined && !["off", "minimal", "low", "medium", "high", "xhigh"].includes(String(value.modelPolicy.thinkingLevel))) throw new Error(`Invalid thinking level for ${name}`);
  }
  if (value.protocolAccess !== undefined) {
    if (!plain(value.protocolAccess)) throw new Error(`agents.${name}.protocolAccess must be an object`);
    exact(value.protocolAccess, ["targets", "effects", "maxDepth", "maxInvocations"], `agents.${name}.protocolAccess`);
    stringArray(value.protocolAccess.targets, 256, `agents.${name}.protocolAccess.targets`);
    if ((value.protocolAccess.targets as string[]).some((target) => target !== "*" && !/^[a-z0-9][a-z0-9_-]{0,127}\.(?:\*|[a-z0-9][a-z0-9_-]{0,127})$/.test(target))) throw new Error(`Invalid protocol target for ${name}`);
    if (value.protocolAccess.effects !== undefined) {
      stringArray(value.protocolAccess.effects, STANDARD_EFFECTS.length, `agents.${name}.protocolAccess.effects`);
      if ((value.protocolAccess.effects as string[]).some((effect) => !(STANDARD_EFFECTS as readonly string[]).includes(effect))) throw new Error(`Invalid protocol effect for ${name}`);
    }
    integer(value.protocolAccess.maxDepth, 0, 32, `agents.${name}.protocolAccess.maxDepth`);
    integer(value.protocolAccess.maxInvocations, 1, 1_024, `agents.${name}.protocolAccess.maxInvocations`);
  }
  if (value.continuation !== undefined) {
    if (!plain(value.continuation)) throw new Error(`agents.${name}.continuation must be an object`);
    exact(value.continuation, ["ttlMs", "maxSessions"], `agents.${name}.continuation`);
    integer(value.continuation.ttlMs, 1_000, 86_400_000, `agents.${name}.continuation.ttlMs`);
    integer(value.continuation.maxSessions, 1, 256, `agents.${name}.continuation.maxSessions`);
  }
}

function exact(value: Record<string, unknown>, allowed: string[], path: string): void {
  const set = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !set.has(key));
  if (unknown) throw new Error(`${path} has unknown field ${unknown}`);
}
function stringArray(value: unknown, max: number, path: string): void {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !item || item.length > 256) || new Set(value).size !== value.length) throw new Error(`${path} must be a bounded unique string array`);
}
function integer(value: unknown, min: number, max: number, path: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)) throw new Error(`${path} must be an integer from ${min} to ${max}`);
}
function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function within(base: string, candidate: string): boolean {
  const path = relative(base, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
