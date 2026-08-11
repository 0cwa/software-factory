import {
  STANDARD_EFFECTS,
  type ProtocolJsonSchema,
  type ProtocolManifestV1,
  type StandardEffect,
} from "@kybernetria/pi-protocol/contract";
import { GENERATED_RUN_PROVIDE, generatedNodeId } from "../schemas.ts";
import type { DependencySnapshot, JsonSchemaLite, PipelineSpecV1 } from "../types.ts";

const legacyEffects: Readonly<Record<string, StandardEffect>> = {
  file_read: "fs.read", file_write: "fs.write", db_read: "db.read", db_write: "db.write",
  network: "network.read", network_read: "network.read", network_send: "network.send",
  process_execution: "process.spawn", model_network: "model.call", protocol_invoke: "protocol.invoke",
};

export function createGeneratedManifest(
  spec: PipelineSpecV1,
  dependencies: readonly DependencySnapshot[] = spec.dependencies ?? [],
): ProtocolManifestV1 {
  const effects = normalizeEffects(dependencies.flatMap((dependency) => dependency.effects));
  const stepSummary = spec.steps.map((step) => step.target).join(" -> ");
  return {
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: {
      id: generatedNodeId(spec.id),
      purpose: spec.description,
      tags: [...new Set(["pipeline", "generated", ...spec.tags])],
    },
    provides: [{
      name: GENERATED_RUN_PROVIDE,
      description: `${spec.description} Fixed pipeline: ${stepSummary}.`,
      tags: [...new Set(["pipeline", "generated", ...spec.tags])],
      inputSchema: canonicalSchema(spec.inputSchema),
      outputSchema: canonicalSchema(spec.outputSchema),
      effects,
      traits: {
        determinism: "best_effort",
        replay: effects.every((effect) => ["fs.read", "db.read", "network.read", "protocol.invoke"].includes(effect)) ? "safe" : "unsafe",
        interaction: "request_response",
        cancellable: true,
      },
    }],
  };
}

function normalizeEffects(values: readonly string[]): StandardEffect[] {
  const standard = new Set<string>(STANDARD_EFFECTS);
  const effects = new Set<StandardEffect>(["protocol.invoke"]);
  for (const value of values) {
    if (standard.has(value)) effects.add(value as StandardEffect);
    else if (legacyEffects[value]) effects.add(legacyEffects[value]);
    else effects.add("external.transaction");
  }
  return [...effects].sort();
}

function canonicalSchema(schema: JsonSchemaLite): ProtocolJsonSchema {
  const result: Record<string, unknown> = {};
  if (schema.type !== undefined) result.type = schema.type;
  if (schema.description !== undefined) result.description = schema.description;
  if (schema.required !== undefined) result.required = [...schema.required];
  if (schema.enum !== undefined) result.enum = structuredClone(schema.enum);
  if (schema.properties !== undefined) {
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, child]) => [name, canonicalSchema(child)]));
  }
  if (schema.items !== undefined) result.items = canonicalSchema(schema.items);
  if (schema.type === "object") result.additionalProperties = schema.properties === undefined;
  return result as unknown as ProtocolJsonSchema;
}
