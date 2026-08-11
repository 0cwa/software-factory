import { parseProtocolManifest, STANDARD_EFFECTS, type ProtocolJsonSchema, type StandardEffect } from "../../packages/pi-protocol/contract/index.ts";
import type {
  ProtocolAgentExecutor,
  ProtocolFabric,
  ProtocolHandler,
  ProtocolNode,
  ProtocolRegistration,
} from "../../packages/pi-protocol/core/index.ts";

interface TestNodeInput {
  node: ProtocolNode;
  handlers?: Record<string, ProtocolHandler>;
  agentExecutors?: Record<string, ProtocolAgentExecutor>;
}

const registrations = new WeakMap<ProtocolFabric, Map<string, ProtocolRegistration>>();
const legacyEffects: Readonly<Record<string, StandardEffect>> = {
  read: "fs.read", write: "fs.write", file_read: "fs.read", file_write: "fs.write",
  db_read: "db.read", db_write: "db.write", network: "network.read",
  network_read: "network.read", network_send: "network.send", process_execution: "process.spawn",
  model_network: "model.call", protocol_invoke: "protocol.invoke",
};

/** Canonically admit compact test fixtures without exposing a raw-registration API. */
export function installTestNode(fabric: ProtocolFabric, input: TestNodeInput): ProtocolRegistration {
  const definition = parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: {
      id: input.node.nodeId,
      purpose: input.node.purpose,
      ...(input.node.tags ? { tags: input.node.tags } : {}),
    },
    provides: input.node.provides.map((provide) => ({
      name: provide.name,
      description: provide.description,
      inputSchema: canonicalSchema(provide.inputSchema),
      outputSchema: canonicalSchema(provide.outputSchema),
      ...(provide.tags ? { tags: provide.tags } : {}),
      ...(normalizedEffects(provide.effects, provide.policy?.confirmation === "required") ? {
        effects: normalizedEffects(provide.effects, provide.policy?.confirmation === "required"),
      } : {}),
    })),
  });
  const handlers: Record<string, ProtocolHandler> = Object.create(null);
  const agents: Record<string, ProtocolAgentExecutor> = Object.create(null);
  for (const provide of input.node.provides) {
    if (provide.execution.type === "handler") handlers[provide.name] = input.handlers![provide.execution.handler];
    else agents[provide.name] = input.agentExecutors?.[provide.execution.agent] as ProtocolAgentExecutor;
  }
  const registration = fabric.install(definition, { handlers, agents }, {
    packageId: `@tests/${input.node.nodeId}`,
    packageVersion: "1.0.0",
  });
  const byNode = registrations.get(fabric) ?? new Map<string, ProtocolRegistration>();
  byNode.set(input.node.nodeId, registration);
  registrations.set(fabric, byNode);
  return registration;
}

export async function disposeTestNode(fabric: ProtocolFabric, nodeId: string): Promise<void> {
  const registration = registrations.get(fabric)?.get(nodeId);
  if (!registration) return;
  registrations.get(fabric)!.delete(nodeId);
  await registration.dispose();
}

function canonicalSchema(schema: any): ProtocolJsonSchema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {};
  const output: Record<string, unknown> = {};
  for (const key of ["type", "required", "enum", "const", "minimum", "maximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "title", "description", "contentEncoding", "contentMediaType"] as const) {
    if (schema[key] !== undefined) output[key] = structuredClone(schema[key]);
  }
  if (schema.properties) output.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, canonicalSchema(value)]));
  if (schema.items) output.items = canonicalSchema(schema.items);
  if (schema.oneOf) output.oneOf = schema.oneOf.map(canonicalSchema);
  if (schema.type === "object") output.additionalProperties = schema.additionalProperties ?? true;
  return output as ProtocolJsonSchema;
}

function normalizedEffects(values: readonly string[] | undefined, confirmation: boolean): StandardEffect[] | undefined {
  const effects = new Set<StandardEffect>();
  for (const value of values ?? []) {
    if ((STANDARD_EFFECTS as readonly string[]).includes(value)) effects.add(value as StandardEffect);
    else effects.add(legacyEffects[value] ?? "fs.write");
  }
  if (confirmation) effects.add("external.transaction");
  return effects.size ? [...effects] : undefined;
}
