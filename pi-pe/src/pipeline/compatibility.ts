import type { JsonSchemaLite } from "@kybernetria/pi-protocol/core";
import type { DependencySnapshot, ResolvedTarget } from "../types.ts";
import { canonicalStringify } from "../schemas.ts";
import { hasMeaningfulSchema } from "./pointers.ts";

export type CompatibilityKind = "compatible" | "unknown" | "incompatible";

export interface CompatibilityResult {
  kind: CompatibilityKind;
  reasons: string[];
}

export function checkSchemaCompatibility(source: JsonSchemaLite, destination: JsonSchemaLite, path = "value"): CompatibilityResult {
  const reasons: string[] = [];
  const kind = compare(source, destination, path, reasons, new Set<string>());
  return { kind, reasons };
}

function compare(
  source: JsonSchemaLite,
  destination: JsonSchemaLite,
  path: string,
  reasons: string[],
  seen: Set<string>,
): CompatibilityKind {
  const key = `${canonicalStringify(source)}=>${canonicalStringify(destination)}`;
  if (seen.has(key)) return "compatible";
  seen.add(key);

  if (!hasMeaningfulSchema(source) || !hasMeaningfulSchema(destination)) {
    reasons.push(`${path} has a broad or absent schema`);
    return "unknown";
  }

  const enumResult = compareEnums(source, destination, path, reasons);
  if (enumResult === "incompatible") return enumResult;

  const sourceType = effectiveType(source);
  const destinationType = effectiveType(destination);
  if (!sourceType || !destinationType) {
    reasons.push(`${path} type cannot be proven`);
    return "unknown";
  }
  if (sourceType !== destinationType && !(sourceType === "integer" && destinationType === "number")) {
    reasons.push(`${path} type ${sourceType} is not assignable to ${destinationType}`);
    return "incompatible";
  }

  let structural: CompatibilityKind = "compatible";
  if (destinationType === "object") structural = compareObjects(source, destination, path, reasons, seen);
  else if (destinationType === "array") structural = compareArrays(source, destination, path, reasons, seen);

  return combine(enumResult, structural);
}

function compareEnums(source: JsonSchemaLite, destination: JsonSchemaLite, path: string, reasons: string[]): CompatibilityKind {
  if (!destination.enum) return "compatible";
  if (!source.enum) {
    reasons.push(`${path} destination has an enum but source does not constrain its values`);
    return "unknown";
  }
  const destinationValues = new Set(destination.enum.map(canonicalStringify));
  const extras = source.enum.filter((value) => !destinationValues.has(canonicalStringify(value)));
  if (extras.length > 0) {
    reasons.push(`${path} source enum contains values outside destination enum: ${extras.map(canonicalStringify).join(", ")}`);
    return "incompatible";
  }
  return "compatible";
}

function compareObjects(
  source: JsonSchemaLite,
  destination: JsonSchemaLite,
  path: string,
  reasons: string[],
  seen: Set<string>,
): CompatibilityKind {
  if (!source.properties || !destination.properties) {
    reasons.push(`${path} uses a generic object schema`);
    return "unknown";
  }
  let result: CompatibilityKind = "compatible";
  for (const property of destination.required ?? []) {
    const sourceProperty = source.properties[property];
    const destinationProperty = destination.properties[property];
    if (!sourceProperty) {
      reasons.push(`${path}.${property} is required by destination but absent from source`);
      return "incompatible";
    }
    if (!(source.required ?? []).includes(property)) {
      reasons.push(`${path}.${property} is required by destination but optional in source`);
      return "incompatible";
    }
    if (!destinationProperty) {
      reasons.push(`${path}.${property} has no destination property schema`);
      result = combine(result, "unknown");
      continue;
    }
    result = combine(result, compare(sourceProperty, destinationProperty, `${path}.${property}`, reasons, seen));
    if (result === "incompatible") return result;
  }
  return result;
}

function compareArrays(
  source: JsonSchemaLite,
  destination: JsonSchemaLite,
  path: string,
  reasons: string[],
  seen: Set<string>,
): CompatibilityKind {
  if (!source.items || !destination.items) {
    reasons.push(`${path} array item schema is broad or absent`);
    return "unknown";
  }
  return compare(source.items, destination.items, `${path}[]`, reasons, seen);
}

function effectiveType(schema: JsonSchemaLite): JsonSchemaLite["type"] {
  if (schema.type) return schema.type;
  if (schema.properties || schema.required) return "object";
  if (schema.items) return "array";
  if (schema.enum?.length) {
    const types = new Set(schema.enum.map(jsonType));
    return types.size === 1 ? [...types][0] : undefined;
  }
  return undefined;
}

function jsonType(value: unknown): JsonSchemaLite["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return undefined;
}

function combine(left: CompatibilityKind, right: CompatibilityKind): CompatibilityKind {
  if (left === "incompatible" || right === "incompatible") return "incompatible";
  if (left === "unknown" || right === "unknown") return "unknown";
  return "compatible";
}

export function inferLiteralSchema(value: unknown): JsonSchemaLite {
  const type = jsonType(value);
  if (type === "array") {
    const values = value as unknown[];
    if (values.length === 0) return { type: "array" };
    const first = inferLiteralSchema(values[0]);
    const homogeneous = values.every((item) => canonicalStringify(inferLiteralSchema(item)) === canonicalStringify(first));
    return homogeneous ? { type: "array", items: first } : { type: "array" };
  }
  if (type === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: "object",
      required: entries.map(([key]) => key),
      properties: Object.fromEntries(entries.map(([key, child]) => [key, inferLiteralSchema(child)])),
    };
  }
  return type ? { type, enum: [value] } : {};
}

export function checkDependencyContractCompatibility(snapshot: DependencySnapshot, current: ResolvedTarget): CompatibilityResult {
  const reasons: string[] = [];
  if (snapshot.execution.type !== current.provide.execution.type) {
    reasons.push(`execution changed from ${snapshot.execution.type} to ${current.provide.execution.type}`);
    return { kind: "incompatible", reasons };
  }
  const oldEffects = new Set(snapshot.effects);
  const addedEffects = (current.provide.effects ?? []).filter((effect) => !oldEffects.has(effect));
  if (addedEffects.length > 0) {
    reasons.push(`new effects require review: ${addedEffects.join(", ")}`);
    return { kind: "incompatible", reasons };
  }

  // Existing constructed inputs must remain accepted by the new input schema.
  const input = checkSchemaCompatibility(snapshot.inputSchema, current.provide.inputSchema, "input");
  // New outputs must remain safe wherever the old output contract was used.
  const output = checkSchemaCompatibility(current.provide.outputSchema, snapshot.outputSchema, "output");
  reasons.push(...input.reasons, ...output.reasons);
  return { kind: combine(input.kind, output.kind), reasons };
}
