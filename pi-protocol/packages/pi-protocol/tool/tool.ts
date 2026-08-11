import { Type } from "@earendil-works/pi-ai";
import type { ProtocolFabric } from "../types.ts";
import { handleProtocolToolInput, normalizeProtocolToolInput } from "./actions.ts";
import { renderProtocolCall, renderProtocolViewModel } from "./renderer.ts";
import { formatProtocolToolResult, projectProtocolViewModel } from "./view-model.ts";
import {
  DEFAULT_PROTOCOL_TOOL_NAME,
  type ProtocolToolLike,
  type ProtocolToolOptions,
  type ProtocolToolRegistrationTarget,
} from "./types.ts";

/**
 * Pi tool projection boundary.
 *
 * This adapter owns Pi-facing tool shape, parameter schema, and text formatting.
 * The protocol fabric remains the source of truth for registry, discovery, and
 * invocation behavior.
 */
export function createProtocolTool(fabric: ProtocolFabric, options: ProtocolToolOptions = {}): ProtocolToolLike {
  const toolName = options.toolName?.trim() || DEFAULT_PROTOCOL_TOOL_NAME;
  return {
    name: toolName,
    label: options.label ?? "Protocol",
    description:
      options.description ??
      "Call a protocol capability by target, or lazily discover capabilities by node.",
    promptSnippet: `${toolName}: call targets or discover nodes, then provides`,
    promptGuidelines: [
      `Call a known capability with { target: "node.provide", input }. The fabric selects its installed implementation automatically.`,
      `Use { op: "list" } for compact node summaries, then { op: "describe", target: "node-id" } to expand one node.`,
      `Use { op: "search", query } only when no known capability clearly fits. Invoke directly from a compact card when its input signature is sufficient.`,
      `Use { op: "describe", target: "node.provide" } only when exact schema fields, constraints, or enums are needed.`,
      `Identity, causal trace, deadlines, cancellation, confirmation, and authority are host-owned and automatic; tool input cannot override them.`,
      `Avoid accidental unbounded self-recursion; intentional recursion needs an explicit stop condition.`,
      `To continue an agent conversation, reuse session.id with session.mode = "continue"; use mode "end" to dispose it.`,
    ],
    parameters: Type.Object({
      op: Type.Optional(Type.Union([
        Type.Literal("list"),
        Type.Literal("search"),
        Type.Literal("describe"),
        Type.Literal("call"),
      ])),
      target: Type.Optional(Type.String({ description: "Capability id: node.provide" })),
      query: Type.Optional(Type.String()),
      cursor: Type.Optional(Type.String({ description: "Opaque cursor returned by list or describe" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      filters: Type.Optional(Type.Object({
        tags: Type.Optional(Type.Array(Type.String())),
        effects: Type.Optional(Type.Array(Type.String())),
      })),
      input: Type.Optional(Type.Any()),
      session: Type.Optional(Type.Object({
        id: Type.Optional(Type.String({ maxLength: 256 })),
        mode: Type.Optional(Type.Union([
          Type.Literal("ephemeral"),
          Type.Literal("continue"),
          Type.Literal("end"),
        ])),
      })),
    }),
    prepareArguments(input) {
      return normalizeProtocolToolInput(input);
    },
    async execute(toolCallId, input, signal, onUpdate) {
      try {
        const prepared = normalizeProtocolToolInput(input);
        const result = await handleProtocolToolInput(fabric, prepared, onUpdate, signal, toolCallId);
        return {
          content: [{ type: "text", text: formatProtocolToolResult(result) }],
          details: result,
        };
      } catch {
        const details = { ok: false, schemaVersion: 1, op: "invalid", error: { code: "INVALID_REQUEST", message: "Protocol tool request is invalid" } };
        return { content: [{ type: "text", text: "INVALID_REQUEST: Protocol tool request is invalid" }], details };
      }
    },
    renderCall(args, theme, context) {
      return renderProtocolCall(args, theme, context?.lastComponent);
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const view = projectProtocolViewModel(result, context?.args, { expanded, isPartial });
      return renderProtocolViewModel(view, theme, { expanded }, context?.lastComponent);
    },
  };
}

export function registerProtocolTool(
  pi: ProtocolToolRegistrationTarget,
  fabric: ProtocolFabric,
  options: ProtocolToolOptions = {},
): { toolName: string; registered: boolean } {
  const toolName = options.toolName?.trim() || DEFAULT_PROTOCOL_TOOL_NAME;
  const visibleTools = safeGetAllTools(pi);
  const alreadyRegistered = visibleTools?.some((tool) => tool.name === toolName) ?? false;
  if (alreadyRegistered) {
    return { toolName, registered: false };
  }

  pi.registerTool(createProtocolTool(fabric, { ...options, toolName }));
  return { toolName, registered: true };
}

function safeGetAllTools(pi: ProtocolToolRegistrationTarget): Array<{ name: string }> | undefined {
  try {
    return pi.getAllTools?.();
  } catch {
    // Pi action methods such as getAllTools() are unavailable during extension
    // loading. registerTool() itself is valid there, so skip duplicate detection
    // until the runtime is bound.
    return undefined;
  }
}
