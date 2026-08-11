import { createChildInvokeRequest } from "../context.ts";
import type { InvokeRequest, ProtocolFabric, ProtocolNode, ProvideSnapshot, ProvideSpec } from "../types.ts";
import { requireText } from "./helpers.ts";
import { invokeWithTraceUpdates } from "./trace.ts";
import type { ProtocolToolInput, ProtocolToolOperation, ProtocolToolUpdateCallback } from "./types.ts";

export async function handleProtocolToolInput(
  fabric: ProtocolFabric,
  input: ProtocolToolInput,
  onUpdate?: ProtocolToolUpdateCallback,
  signal?: AbortSignal,
  toolCallId?: string,
): Promise<unknown> {
  const command = input;
  const op = command.op ?? (command.target ? "call" : "list");
  switch (op) {
    case "list":
      return compactNodeCatalog(fabric, command.limit, command.cursor);

    case "search":
      return searchCapabilities(
        fabric,
        requireText(command.query, "protocol search requires query"),
        command.limit,
        command.filters,
      );

    case "describe": {
      const target = requireText(command.target, "protocol describe requires target");
      const parsed = parseTarget(target);
      if (!parsed) {
        const node = fabric.describeNode(target);
        return node
          ? { ok: true, schemaVersion: 1, op: "describe", node: summarizeNode(node, command.limit, command.cursor) }
          : { ok: false, schemaVersion: 1, op: "describe", error: { code: "NOT_FOUND", message: `Target not found: ${target}` } };
      }
      const provide = fabric.describeProvide(parsed.nodeId, parsed.provide);
      return provide
        ? { ok: true, schemaVersion: 1, op: "describe", provide: summarizeProvideSnapshot(provide) }
        : { ok: false, schemaVersion: 1, op: "describe", error: { code: "NOT_FOUND", message: `Target not found: ${target}` } };
    }

    case "call": {
      const request = createChildInvokeRequest(toInvokeRequest(command));
      return invokeWithTraceUpdates(fabric, request, onUpdate, signal, toolCallId);
    }
  }
}

export function normalizeProtocolToolInput(input: unknown): ProtocolToolInput {
  if (!isRecord(input)) throw new Error("protocol input must be an object");
  assertExactKeys(input, ["op", "query", "cursor", "limit", "filters", "target", "input", "session"]);
  const op = input.op === undefined ? (input.target === undefined ? "list" : "call") : operation(input.op);
  const output: ProtocolToolInput = { op };
  if (input.query !== undefined) output.query = text(input.query, "query", 4_096);
  if (input.cursor !== undefined) output.cursor = text(input.cursor, "cursor", 4_096);
  if (input.target !== undefined) output.target = text(input.target, "target", 512);
  if (input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 50) throw new Error("protocol limit is invalid");
    output.limit = input.limit as number;
  }
  if (input.filters !== undefined) output.filters = filters(input.filters);
  if (Object.hasOwn(input, "input")) output.input = input.input;
  if (input.session !== undefined) output.session = session(input.session);
  return output;
}

function operation(value: unknown): ProtocolToolOperation {
  if (value === "list" || value === "search" || value === "describe" || value === "call") return value;
  throw new Error("protocol op is invalid");
}

function filters(value: unknown): NonNullable<ProtocolToolInput["filters"]> {
  if (!isRecord(value)) throw new Error("protocol filters must be an object");
  assertExactKeys(value, ["tags", "effects"]);
  return {
    ...(value.tags !== undefined ? { tags: textArray(value.tags, "tags") } : {}),
    ...(value.effects !== undefined ? { effects: textArray(value.effects, "effects") } : {}),
  };
}

function session(value: unknown): NonNullable<ProtocolToolInput["session"]> {
  if (!isRecord(value)) throw new Error("protocol session must be an object");
  assertExactKeys(value, ["id", "mode"]);
  if (value.mode !== undefined && value.mode !== "ephemeral" && value.mode !== "continue" && value.mode !== "end") throw new Error("protocol session mode is invalid");
  return {
    ...(value.id !== undefined ? { id: text(value.id, "session.id", 256) } : {}),
    ...(value.mode !== undefined ? { mode: value.mode } : {}),
  };
}

function textArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error(`protocol ${label} is invalid`);
  return value.map((item) => text(item, label, 256));
}

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) throw new Error(`protocol ${label} is invalid`);
  return value;
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) throw new Error("protocol input contains unsupported fields");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function compactNodeCatalog(fabric: ProtocolFabric, requestedLimit?: number, cursor?: string): unknown {
  const registry = fabric.registry();
  const limit = boundedLimit(requestedLimit);
  const offset = decodeCursor(cursor);
  return {
    ok: true,
    schemaVersion: 1,
    op: "list",
    nodes: registry.nodes.slice(offset, offset + limit).map((node) => ({
      nodeId: node.nodeId,
      purpose: node.purpose,
      tags: node.tags ?? [],
      provideCount: node.provides.length,
    })),
    ...(nextCursor(offset, limit, registry.nodes.length) ? { nextCursor: nextCursor(offset, limit, registry.nodes.length) } : {}),
    discovery: {
      expandNode: { op: "describe", target: "node-id" },
      search: { op: "search", query: "...", limit: 12 },
      invokeKnown: { target: "node.provide", input: "matching input" },
      inspectExactContractOnlyIfNeeded: { op: "describe", target: "node.provide" },
      continue: { op: "list", cursor: "returned-nextCursor" },
    },
  };
}

function compactProvideCard(provide: ProvideSnapshot): unknown {
  return {
    target: provide.globalId,
    description: provide.description,
    input: summarizeSchema(provide.inputSchema),
    effects: provide.effects ?? [],
  };
}

function searchCapabilities(
  fabric: ProtocolFabric,
  query: string,
  requestedLimit?: number,
  filters?: ProtocolToolInput["filters"],
): unknown {
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit!)) : 12;
  const matches = fabric.search(query, { limit, tags: filters?.tags, effects: filters?.effects });
  return {
    ok: true,
    schemaVersion: 1,
    op: "search",
    query,
    limit,
    totalMatches: matches.totalMatches,
    capabilities: matches.provides.map((provide) => compactProvideCard(provide)),
    next: "invoke directly when the compact input signature is sufficient; describe only for exact schema details",
  };
}

function summarizeNode(node: ProtocolNode, requestedLimit?: number, cursor?: string): unknown {
  const limit = boundedLimit(requestedLimit);
  const offset = decodeCursor(cursor);
  return {
    nodeId: node.nodeId,
    purpose: node.purpose,
    tags: node.tags ?? [],
    provideCount: node.provides.length,
    provides: node.provides.slice(offset, offset + limit).map((provide) => summarizeProvide(node.nodeId, provide)),
    ...(nextCursor(offset, limit, node.provides.length) ? { nextCursor: nextCursor(offset, limit, node.provides.length) } : {}),
    next: "invoke directly when the compact input signature is sufficient; describe only for exact schema details",
  };
}

function summarizeProvide(nodeId: string, provide: ProvideSpec): unknown {
  return {
    target: `${nodeId}.${provide.name}`,
    name: provide.name,
    description: provide.description,
    input: summarizeSchema(provide.inputSchema),
    effects: provide.effects ?? [],
  };
}

function summarizeProvideSnapshot(provide: ProvideSnapshot): unknown {
  const schemaBudget = { remainingChars: 64_000, remainingValues: 4_096, truncated: false };
  const inputSchema = projectSchema(provide.inputSchema, schemaBudget, 0);
  const outputSchema = projectSchema(provide.outputSchema, schemaBudget, 0);
  return {
    nodeId: provide.nodeId,
    globalId: provide.globalId,
    name: provide.name,
    description: provide.description,
    ...(provide.version ? { version: provide.version } : {}),
    ...(provide.tags ? { tags: provide.tags } : {}),
    ...(provide.effects ? { effects: provide.effects } : {}),
    input: summarizeSchema(provide.inputSchema),
    output: summarizeSchema(provide.outputSchema),
    inputSchema,
    outputSchema,
    schemaTruncated: schemaBudget.truncated,
    invocationControls: summarizeInvocationControls(),
    invoke: {
      op: "call",
      target: `${provide.nodeId}.${provide.name}`,
      input: "...",
      session: { id: "optional-session-id", mode: "continue" },
    },
  };
}

function summarizeInvocationControls(): unknown {
  return {
    hostOwned: ["principal", "grant", "trace", "caller", "deadline", "cancellation", "confirmation"],
    session: {
      modes: ["ephemeral", "continue", "end"],
      requiresIdFor: ["continue", "end"],
      note: "Continuation availability is declared by the installed capability implementation.",
    },
  };
}

function summarizeSchema(schema: ProvideSpec["inputSchema"]): string {
  const summary = summarizeSchemaInner(schema, 0);
  return summary.length > 2_000 ? `${summary.slice(0, 1_999)}…` : summary;
}

function summarizeSchemaInner(schema: ProvideSpec["inputSchema"], depth: number): string {
  if (depth >= 8) return "…";
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const props = Object.keys(schema.properties ?? {}).slice(0, 128).map((name) => `${name}${required.has(name) ? "" : "?"}`);
    return props.length > 0 ? `object { ${props.join(", ")} }` : "object";
  }
  if (schema.type === "array") return `array<${summarizeSchemaInner(schema.items ?? {}, depth + 1)}>`;
  if (schema.enum) return `enum(${schema.enum.slice(0, 64).map(String).join(" | ")})`;
  return schema.type ?? "unknown";
}

interface SchemaProjectionBudget {
  remainingChars: number;
  remainingValues: number;
  truncated: boolean;
}

function projectSchema(value: unknown, budget: SchemaProjectionBudget, depth: number): unknown {
  if (budget.remainingValues-- <= 0 || budget.remainingChars <= 0 || depth > 32) {
    budget.truncated = true;
    return "[schema projection limit]";
  }
  if (typeof value === "string") {
    const length = Math.min(value.length, budget.remainingChars, 4_096);
    budget.remainingChars -= length;
    if (length < value.length) budget.truncated = true;
    return length < value.length ? `${value.slice(0, Math.max(0, length - 1))}…` : value;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    if (value.length > 256) budget.truncated = true;
    return value.slice(0, 256).map((item) => projectSchema(item, budget, depth + 1));
  }
  if (typeof value !== "object") { budget.truncated = true; return "[unsupported schema value]"; }
  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries.slice(0, 256)) {
    budget.remainingChars -= key.length;
    result[key] = projectSchema(child, budget, depth + 1);
  }
  if (entries.length > 256) budget.truncated = true;
  return result;
}

function boundedLimit(requested?: number): number {
  return Number.isInteger(requested) ? Math.max(1, Math.min(50, requested!)) : 12;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  if (!/^p:[0-9a-z]+$/.test(cursor)) throw new Error("protocol cursor is invalid");
  const offset = Number.parseInt(cursor.slice(2), 36);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("protocol cursor is invalid");
  return offset;
}

function nextCursor(offset: number, limit: number, total: number): string | undefined {
  const next = offset + limit;
  return next < total ? `p:${next.toString(36)}` : undefined;
}

function parseTarget(target: string): { nodeId: string; provide: string } | undefined {
  const separator = target.lastIndexOf(".");
  if (separator <= 0 || separator === target.length - 1) return undefined;
  return { nodeId: target.slice(0, separator), provide: target.slice(separator + 1) };
}

function toInvokeRequest(input: ProtocolToolInput): InvokeRequest {
  const target = requireText(input.target, "protocol call requires target");
  const parsed = parseTarget(target);
  if (!parsed) throw new Error("protocol target must be node.provide");
  return {
    nodeId: parsed.nodeId,
    provide: parsed.provide,
    input: input.input,
    ...(input.session ? { session: input.session } : {}),
  };
}
