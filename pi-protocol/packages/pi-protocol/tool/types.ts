import type { InvokeRequest } from "../types.ts";

export const DEFAULT_PROTOCOL_TOOL_NAME = "protocol";

export type ProtocolToolOperation = "list" | "search" | "describe" | "call";

export interface ProtocolToolInput {
  /** Compact API: omit op to call target directly. */
  op?: ProtocolToolOperation;
  query?: string;
  /** Opaque cursor returned by bounded list or describe results. */
  cursor?: string;
  /** Bounded search result count (default 12, maximum 50). */
  limit?: number;
  /** Optional search filters. */
  filters?: {
    tags?: string[];
    effects?: string[];
  };
  target?: string;
  input?: unknown;
  /** Canonical continuation control. Provenance and caller identity are host-owned. */
  session?: InvokeRequest["session"];
}

export interface ProtocolToolResultContent {
  type: "text";
  text: string;
}

export interface ProtocolToolExecutionResult {
  content: ProtocolToolResultContent[];
  details: unknown;
}

export type ProtocolToolUpdateCallback = (partial: ProtocolToolExecutionResult) => void;

export interface ProtocolToolLike {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
  prepareArguments?(input: unknown): ProtocolToolInput;
  execute(
    toolCallId: string,
    input: ProtocolToolInput,
    signal?: AbortSignal,
    onUpdate?: ProtocolToolUpdateCallback,
  ): Promise<ProtocolToolExecutionResult>;
  renderCall?: (args: ProtocolToolInput, theme: ProtocolToolThemeLike, context?: { lastComponent?: unknown }) => unknown;
  renderResult?: (
    result: ProtocolToolExecutionResult,
    options: { expanded?: boolean; isPartial?: boolean },
    theme: ProtocolToolThemeLike,
    context?: { args?: ProtocolToolInput; lastComponent?: unknown },
  ) => unknown;
}

export interface ProtocolToolThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

export interface ProtocolToolRegistrationTarget {
  registerTool(tool: ProtocolToolLike): void;
  getAllTools?: () => Array<{ name: string }>;
}

export interface ProtocolToolOptions {
  toolName?: string;
  label?: string;
  description?: string;
}
