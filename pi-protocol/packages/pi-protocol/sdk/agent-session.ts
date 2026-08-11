import { readFileSync } from "node:fs";
import type { ProtocolDefinition } from "../contract/types.ts";

import { runWithProtocolInvocationContextValue } from "../context.ts";
import { runWithInvocationControl, type InvocationControlState } from "../control.ts";
import type { CurrentProtocolInvocationContext } from "../context.ts";
import { ensureProtocolFabric } from "../fabric.ts";
import type { ProtocolAgentExecutor } from "../types.ts";
import { createProtocolTool, DEFAULT_PROTOCOL_TOOL_NAME } from "../tool/index.ts";
import {
  createPiSdkAgentExecutor,
  type CreatePiSdkAgentExecutorOptions,
  type PiSdkAgentSessionFactory,
  type PiSdkAgentSessionLike,
} from "./index.ts";
import { validateAgentProvideBindings } from "./agent-profile.ts";
import type {
  PiAgentProvideBindings,
  ResolvedPiAgentProfile,
  ResolvedPiAgentProfiles,
} from "./agent-profile.ts";

export {
  createPiSdkAgentExecutor,
  disposeAllProtocolAgentSessions,
  getProtocolAgentSessionDiagnostics,
  runWithPiSdkProtocolControlContext,
} from "./index.ts";
export type {
  CreatePiSdkAgentExecutorOptions,
  PiSdkAgentSessionEventLike,
  PiSdkAgentSessionFactory,
  PiSdkAgentSessionLike,
  PiSdkProtocolControlContext,
} from "./index.ts";
export {
  parsePiAgentProfiles,
  resolvePiAgentProfiles,
  validateAgentProvideBindings,
} from "./agent-profile.ts";
export type {
  PiAgentProfilesFile,
  PiAgentProvideBindings,
  ResolvedPiAgentProfile,
  ResolvedPiAgentProfiles,
} from "./agent-profile.ts";

export interface PiSdkCreateAgentSessionOptions {
  cwd?: string;
  sessionManager?: unknown;
  [key: string]: unknown;
}

interface PrivateModelHint {
  specific?: string;
  provider?: string;
}

interface PiModelRuntimeLike {
  getModel(provider: string, modelId: string): unknown;
  getModels(provider?: string): readonly unknown[];
}

interface PiCodingAgentSdk {
  createAgentSession(options?: PiSdkCreateAgentSessionOptions): Promise<{ session: unknown }>;
  ModelRuntime?: { create(options?: unknown): Promise<PiModelRuntimeLike> };
  SessionManager: {
    create(cwd?: string): unknown;
    inMemory(cwd?: string): unknown;
  };
  getAgentDir?: () => string;
  DefaultResourceLoader?: new (options: {
    cwd: string;
    agentDir?: string;
    systemPromptOverride?: () => string;
    appendSystemPromptOverride?: (base: string[]) => string[];
  }) => { reload(): Promise<void> };
}

/** Shared protocol guidance, loaded from the package-local editable Markdown source. */
export const DEFAULT_PROTOCOL_AGENT_TOOLS = [DEFAULT_PROTOCOL_TOOL_NAME] as const;

export const UNIVERSAL_PROTOCOL_AWARENESS_PROMPT = readFileSync(
  new URL("../prompts/protocol-awareness.md", import.meta.url),
  "utf8",
).trim();

export interface CreatePiSdkAgentSessionFactoryOptions {
  sessionOptions?: PiSdkCreateAgentSessionOptions;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace";
  protocolAvailable?: boolean;
}

export interface CreateDefaultPiSdkAgentExecutorOptions
  extends Omit<CreatePiSdkAgentExecutorOptions, "createSession"> {
  createSession?: PiSdkAgentSessionFactory;
  sessionOptions?: PiSdkCreateAgentSessionOptions;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace";
}

export interface CreatePiSdkAgentExecutorsFromProfilesOptions {
  readonly agentByProvide: PiAgentProvideBindings;
  readonly createSessionForAgent?: (agentName: string, profile: ResolvedPiAgentProfile) => PiSdkAgentSessionFactory | undefined;
  readonly sessionOptionsByAgent?: (agentName: string, profile: ResolvedPiAgentProfile) => PiSdkCreateAgentSessionOptions | undefined;
  readonly toPromptByAgent?: (agentName: string, profile: ResolvedPiAgentProfile) => CreatePiSdkAgentExecutorOptions["toPrompt"];
  readonly toOutputByAgent?: (agentName: string, profile: ResolvedPiAgentProfile) => CreatePiSdkAgentExecutorOptions["toOutput"];
  readonly modelOverrides?: Readonly<Record<string, string>>;
  readonly modelClassOverrides?: Readonly<Partial<Record<"fast" | "balanced" | "reasoning", string>>>;
}

export function createPiSdkAgentSessionFactory(
  options: CreatePiSdkAgentSessionFactoryOptions = {},
): PiSdkAgentSessionFactory {
  return async () => {
    const sdk = await loadPiCodingAgentSdk();
    const sessionOptions = await resolveModelHintSessionOptions(sdk, options.sessionOptions ?? {});
    const protocolAvailable = options.protocolAvailable ?? (Array.isArray(sessionOptions.tools) && sessionOptions.tools.includes(DEFAULT_PROTOCOL_TOOL_NAME));
    const resourceLoader = await createResourceLoader(sdk, sessionOptions, options.systemPrompt, options.systemPromptMode, protocolAvailable);
    let activeProtocolContext: CurrentProtocolInvocationContext | undefined;
    let activeProtocolControl: InvocationControlState | undefined;
    const protocolTool = protocolAvailable ? createProtocolTool(ensureProtocolFabric()) : undefined;
    const boundProtocolTool = protocolTool ? {
      ...protocolTool,
      async execute(toolCallId: string, input: Parameters<NonNullable<typeof protocolTool>["execute"]>[1], signal?: AbortSignal, onUpdate?: Parameters<NonNullable<typeof protocolTool>["execute"]>[3]) {
        const execute = () => protocolTool.execute(toolCallId, input, signal, onUpdate);
        const withLegacyContext = () => activeProtocolContext
          ? runWithProtocolInvocationContextValue(activeProtocolContext, execute)
          : execute();
        return activeProtocolControl
          ? runWithInvocationControl(activeProtocolControl, withLegacyContext)
          : withLegacyContext();
      },
    } : undefined;
    const customTools = [
      ...(boundProtocolTool ? [boundProtocolTool] : []),
      ...((sessionOptions.customTools as unknown[] | undefined) ?? []).filter(
        (tool) => !isToolNamed(tool, DEFAULT_PROTOCOL_TOOL_NAME),
      ),
    ];
    const { session } = await sdk.createAgentSession({
      ...sessionOptions,
      sessionManager: sessionOptions.sessionManager ?? sdk.SessionManager.create(sessionOptions.cwd ?? process.cwd()),
      customTools,
      ...(resourceLoader ? { resourceLoader } : {}),
    });
    assertExactToolAllowlist(session, sessionOptions.tools);
    const protocolAwareSession = session as PiSdkAgentSessionLike;
    protocolAwareSession.setProtocolInvocationContext = (context) => {
      activeProtocolContext = context;
    };
    protocolAwareSession.setProtocolControlContext = (context) => {
      activeProtocolControl = context;
    };

    return protocolAwareSession;
  };
}

export function createDefaultPiSdkAgentExecutor(
  options: CreateDefaultPiSdkAgentExecutorOptions = {},
): ProtocolAgentExecutor {
  const { createSession, sessionOptions, systemPrompt, systemPromptMode, ...executorOptions } = options;

  return createPiSdkAgentExecutor({
    ...executorOptions,
    createSession: createSession ?? createPiSdkAgentSessionFactory({ sessionOptions, systemPrompt, systemPromptMode }),
  });
}

export function createPiSdkAgentExecutorsFromProfiles(
  definition: ProtocolDefinition,
  profiles: ResolvedPiAgentProfiles,
  options: CreatePiSdkAgentExecutorsFromProfilesOptions,
): Record<string, ProtocolAgentExecutor> {
  validateAgentProvideBindings(definition, profiles, options.agentByProvide);
  const executors: Record<string, ProtocolAgentExecutor> = Object.create(null);
  for (const [provideName, agentName] of Object.entries(options.agentByProvide)) {
    const profile = profiles.agents[agentName];
    const tools = [...(profile.tools ?? DEFAULT_PROTOCOL_AGENT_TOOLS)];
    const specific = options.modelOverrides?.[agentName]
      ?? profile.modelPolicy?.specific
      ?? (profile.modelPolicy?.class ? options.modelClassOverrides?.[profile.modelPolicy.class] : undefined);
    const sessionOptions: PiSdkCreateAgentSessionOptions = {
      ...(options.sessionOptionsByAgent?.(agentName, profile) ?? {}),
      tools,
      ...(specific ? { protocolModelHint: { specific } } : {}),
      ...(profile.modelPolicy?.thinkingLevel ? { thinkingLevel: profile.modelPolicy.thinkingLevel } : {}),
    };
    const createSession = options.createSessionForAgent?.(agentName, profile)
      ?? createPiSdkAgentSessionFactory({
        sessionOptions,
        systemPrompt: profile.promptText,
        systemPromptMode: "replace",
        protocolAvailable: tools.includes(DEFAULT_PROTOCOL_TOOL_NAME),
      });
    executors[provideName] = createPiSdkAgentExecutor({
      createSession,
      toPrompt: options.toPromptByAgent?.(agentName, profile),
      toOutput: options.toOutputByAgent?.(agentName, profile),
      protocolGrant: profile.protocolAccess,
      sessionCache: profile.continuation,
    });
  }
  return executors;
}

function isToolNamed(tool: unknown, name: string): boolean {
  return typeof tool === "object" && tool !== null && (tool as { name?: unknown }).name === name;
}

function assertExactToolAllowlist(session: unknown, requestedTools: unknown): void {
  if (!Array.isArray(requestedTools)) return;

  const getActiveToolNames = (session as { getActiveToolNames?: unknown }).getActiveToolNames;
  if (typeof getActiveToolNames !== "function") {
    throw new Error("Pi SDK AgentSession does not expose getActiveToolNames(); cannot verify protocol agent tool allowlist.");
  }

  const activeTools = getActiveToolNames.call(session);
  if (!Array.isArray(activeTools) || !activeTools.every((tool) => typeof tool === "string")) {
    throw new Error("Pi SDK AgentSession returned an invalid active tool list.");
  }

  const expected = [...requestedTools].sort();
  const actual = [...activeTools].sort();
  if (expected.length !== actual.length || expected.some((tool, index) => tool !== actual[index])) {
    throw new Error(
      `Protocol agent tool allowlist could not be applied: requested ${JSON.stringify(expected)}, active ${JSON.stringify(actual)}.`,
    );
  }
}

async function resolveModelHintSessionOptions(
  sdk: PiCodingAgentSdk,
  sessionOptions: PiSdkCreateAgentSessionOptions,
): Promise<PiSdkCreateAgentSessionOptions> {
  const hint = sessionOptions.protocolModelHint as PrivateModelHint | undefined;
  if (!hint?.specific || sessionOptions.model) return sessionOptions;

  const { protocolModelHint: _protocolModelHint, ...rest } = sessionOptions;
  if (!sdk.ModelRuntime) throw new Error("Pi SDK ModelRuntime is required by Pi Protocol v4");
  const runtime = isModelRuntimeLike(sessionOptions.modelRuntime)
    ? sessionOptions.modelRuntime
    : await sdk.ModelRuntime.create();
  const model = resolveModelFromRuntime(runtime, hint);
  if (!model) throw unresolvedModelHint(hint.specific);
  return { ...rest, model, modelRuntime: runtime };
}

function unresolvedModelHint(specific: string): Error {
  return new Error(`Protocol modelHint.specific ${JSON.stringify(specific)} could not be resolved. Use "provider/model-id" or include modelHint.provider.`);
}

function isModelRuntimeLike(value: unknown): value is PiModelRuntimeLike {
  return typeof value === "object" && value !== null
    && typeof (value as PiModelRuntimeLike).getModel === "function"
    && typeof (value as PiModelRuntimeLike).getModels === "function";
}

function resolveModelFromRuntime(runtime: PiModelRuntimeLike, hint: PrivateModelHint): unknown {
  const specific = hint.specific?.trim();
  if (!specific) return undefined;
  const slash = specific.indexOf("/");
  if (slash > 0) {
    const provider = specific.slice(0, slash).trim();
    const modelId = specific.slice(slash + 1).trim();
    return provider && modelId ? runtime.getModel(provider, modelId) : undefined;
  }
  if (hint.provider?.trim()) return runtime.getModel(hint.provider.trim(), specific);
  const normalized = normalizeModelPattern(specific);
  const matches = runtime.getModels().filter((model) => {
    const candidate = model as { id?: unknown; model?: unknown; name?: unknown; provider?: unknown };
    return [candidate.id, candidate.model, candidate.name, `${candidate.provider ?? ""}/${candidate.id ?? candidate.model ?? ""}`]
      .some((value) => normalizeModelPattern(String(value ?? "")) === normalized);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function normalizeModelPattern(value: string): string {
  return value.toLowerCase().replace(/[\s:_-]+/g, "");
}

async function createResourceLoader(
  sdk: PiCodingAgentSdk,
  sessionOptions: PiSdkCreateAgentSessionOptions,
  systemPrompt: string | undefined,
  mode: "append" | "replace" = "append",
  protocolAvailable = true,
): Promise<unknown> {
  const trimmed = systemPrompt?.trim();
  if (!sdk.DefaultResourceLoader) return undefined;

  const loaderOptions: {
    cwd: string;
    agentDir?: string;
    systemPromptOverride?: () => string;
    appendSystemPromptOverride?: (base: string[]) => string[];
  } = {
    cwd: sessionOptions.cwd ?? process.cwd(),
    ...(typeof sessionOptions.agentDir === "string"
      ? { agentDir: sessionOptions.agentDir }
      : sdk.getAgentDir ? { agentDir: sdk.getAgentDir() } : {}),
  };

  const awareness = protocolAvailable ? [UNIVERSAL_PROTOCOL_AWARENESS_PROMPT] : [];
  if (mode === "replace" && trimmed) {
    loaderOptions.systemPromptOverride = () => trimmed;
    if (awareness.length) loaderOptions.appendSystemPromptOverride = (base: string[]) => appendUniquePromptChunks(base, awareness);
  } else {
    loaderOptions.appendSystemPromptOverride = (base: string[]) =>
      appendUniquePromptChunks(base, [
        ...awareness,
        ...(trimmed ? [`## Agent instructions\n${trimmed}`] : []),
      ]);
  }

  const loader = new sdk.DefaultResourceLoader(loaderOptions);
  await loader.reload();
  return loader;
}

export function appendUniquePromptChunks(base: string[], chunks: string[]): string[] {
  const result = [...base];
  for (const chunk of chunks) {
    if (!result.some((item) => item.includes(chunk))) {
      result.push(chunk);
    }
  }
  return result;
}

async function loadPiCodingAgentSdk(): Promise<PiCodingAgentSdk> {
  try {
    return (await import("@earendil-works/pi-coding-agent")) as unknown as PiCodingAgentSdk;
  } catch (error) {
    throw new Error(
      "@earendil-works/pi-coding-agent is required to create real Pi SDK agent sessions. " +
        "Install/provide it in the host Pi environment, or use createPiSdkAgentExecutor() with an injected createSession().",
      { cause: error },
    );
  }
}
