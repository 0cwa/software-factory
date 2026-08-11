import { readFile } from "node:fs/promises";
import type { JsonSchemaLite, ProtocolFabric, ProtocolHandler, ProtocolRegistration } from "@kybernetria/pi-protocol/core";
import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";
import type { PipelineSpecV1, ResolvedTarget, TargetResolver } from "../src/types.ts";

interface TestProvide {
  name: string;
  description: string;
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  execution: { type: "handler"; handler: string };
  effects?: string[];
  tags?: string[];
  version?: string;
}
interface TestNode {
  nodeId: string;
  purpose: string;
  provides: TestProvide[];
  tags?: string[];
  protocolVersion?: string;
  packageId?: string;
  version?: string;
}
const registrations = new WeakMap<ProtocolFabric, Map<string, ProtocolRegistration>>();

export async function fixture(name: string): Promise<PipelineSpecV1> {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8")) as PipelineSpecV1;
}

export function installTestNode(fabric: ProtocolFabric, input: { node: TestNode; handlers: Record<string, ProtocolHandler> }): ProtocolRegistration {
  const definition = parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: { id: input.node.nodeId, purpose: input.node.purpose, ...(input.node.tags ? { tags: input.node.tags } : {}) },
    provides: input.node.provides.map((provide) => ({
      name: provide.name,
      description: provide.description,
      inputSchema: canonicalSchema(provide.inputSchema),
      outputSchema: canonicalSchema(provide.outputSchema),
      ...(provide.effects?.length ? { effects: provide.effects.map(normalizeEffect) } : {}),
      ...(provide.tags ? { tags: provide.tags } : {}),
    })),
  });
  const handlers = Object.fromEntries(input.node.provides.map((provide) => [provide.name, input.handlers[provide.execution.handler]]));
  const registration = fabric.install(definition, { handlers }, {
    packageId: input.node.packageId ?? `test/${input.node.nodeId}`,
    packageVersion: input.node.version ?? "1.0.0",
  });
  const current = registrations.get(fabric) ?? new Map<string, ProtocolRegistration>();
  current.set(input.node.nodeId, registration);
  registrations.set(fabric, current);
  return registration;
}

export async function disposeTestNode(fabric: ProtocolFabric, nodeId: string): Promise<void> {
  const registration = registrations.get(fabric)?.get(nodeId);
  if (!registration) return;
  registrations.get(fabric)?.delete(nodeId);
  await registration.dispose();
}

export function registerHandler(
  fabric: ProtocolFabric,
  nodeId: string,
  provide: string,
  inputSchema: JsonSchemaLite,
  outputSchema: JsonSchemaLite,
  handler: ProtocolHandler,
  effects: string[] = [],
  version = "1.0.0",
): ProtocolRegistration {
  return installTestNode(fabric, {
    node: { nodeId, packageId: `test/${nodeId}`, version, purpose: `Test node ${nodeId}`, provides: [{
      name: provide,
      description: `Test provide ${provide}`,
      inputSchema,
      outputSchema,
      execution: { type: "handler", handler: provide },
      effects,
    }] },
    handlers: { [provide]: handler },
  });
}

export function registerMappedFixtures(fabric: ProtocolFabric, order: string[] = []): ProtocolRegistration {
  return installTestNode(fabric, {
    node: {
      nodeId: "fixture",
      purpose: "Mapped fixture targets",
      provides: [
        {
          name: "upper", description: "Uppercase text",
          inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
          outputSchema: { type: "object", required: ["value"], properties: { value: { type: "string" } } },
          execution: { type: "handler", handler: "upper" },
        },
        {
          name: "wrap", description: "Wrap a value",
          inputSchema: { type: "object", required: ["value", "prefix"], properties: { value: { type: "string" }, prefix: { type: "string" } } },
          outputSchema: { type: "object", required: ["result"], properties: { result: { type: "string" } } },
          execution: { type: "handler", handler: "wrap" }, effects: ["fs.write"],
        },
      ],
    },
    handlers: {
      upper: (input) => { order.push("upper"); return { value: String((input as { text: string }).text).toUpperCase() }; },
      wrap: (input) => { order.push("wrap"); const value = input as { value: string; prefix: string }; return { result: `${value.prefix}${value.value}` }; },
    },
  });
}

export function resolverFrom(fabric: ProtocolFabric): TargetResolver {
  return (target): ResolvedTarget | undefined => {
    const [nodeId, provide] = target.split(".");
    const snapshot = fabric.describeProvide(nodeId, provide);
    return snapshot ? { provide: snapshot } : undefined;
  };
}

function canonicalSchema(schema: JsonSchemaLite): JsonSchemaLite & { additionalProperties?: boolean } {
  return {
    ...schema,
    ...(schema.type === "object" ? { additionalProperties: true } : {}),
    ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, canonicalSchema(value)])) } : {}),
    ...(schema.items ? { items: canonicalSchema(schema.items) } : {}),
  };
}
function normalizeEffect(effect: string): string { return effect === "write" ? "fs.write" : effect; }
