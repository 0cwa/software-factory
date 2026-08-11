import type { JsonSchemaLite } from "@kybernetria/pi-protocol/core";
import { deepCloneJson, isPlainObject } from "../schemas.ts";

const BLOCKED_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;

export const MISSING = Symbol("pi-pe.missing");
export type Missing = typeof MISSING;

export function parseJsonPointer(pointer = "", destination = false): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`JSON Pointer must be empty or start with "/": ${JSON.stringify(pointer)}`);
  const segments = pointer.slice(1).split("/").map((token) => {
    if (/~(?:[^01]|$)/.test(token)) throw new Error(`Malformed JSON Pointer escape in ${JSON.stringify(pointer)}`);
    const decoded = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (destination && BLOCKED_SEGMENTS.has(decoded)) throw new Error(`Unsafe destination segment ${JSON.stringify(decoded)}`);
    return decoded;
  });
  return segments;
}

export function getPointer(value: unknown, pointer = ""): unknown | Missing {
  const segments = parseJsonPointer(pointer);
  let current = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!ARRAY_INDEX.test(segment)) throw new Error(`Array pointer segment must be a canonical non-negative index: ${JSON.stringify(segment)}`);
      const index = Number(segment);
      if (index >= current.length) throw new Error(`Array pointer index ${index} is outside bounds for length ${current.length}`);
      current = current[index];
      continue;
    }
    if (!isPlainObject(current)) throw new Error(`JSON Pointer traverses a non-container before segment ${JSON.stringify(segment)}`);
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return MISSING;
    current = current[segment];
  }
  return current;
}

export function setPointer(root: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = parseJsonPointer(pointer, true);
  if (segments.length === 0) throw new Error("Object mapping destination pointer may not select the root");
  let current: Record<string, unknown> | unknown[] = root;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const final = index === segments.length - 1;
    if (Array.isArray(current)) {
      if (!ARRAY_INDEX.test(segment)) throw new Error(`Array destination segment must be a canonical non-negative index: ${JSON.stringify(segment)}`);
      const arrayIndex = Number(segment);
      if (arrayIndex > current.length) throw new Error(`Array destination index ${arrayIndex} is outside the writable bound ${current.length}`);
      if (final) {
        if (arrayIndex === current.length) current.push(deepCloneJson(value));
        else current[arrayIndex] = deepCloneJson(value);
        return;
      }
      if (arrayIndex === current.length) current.push(createContainer(segments[index + 1]));
      const child: unknown = current[arrayIndex];
      if (!Array.isArray(child) && !isPlainObject(child)) throw new Error(`Destination traverses a non-container at /${segments.slice(0, index + 1).join("/")}`);
      current = child;
      continue;
    }

    if (final) {
      Object.defineProperty(current, segment, {
        value: deepCloneJson(value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      Object.defineProperty(current, segment, {
        value: createContainer(segments[index + 1]),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    const child: unknown = current[segment];
    if (!Array.isArray(child) && !isPlainObject(child)) throw new Error(`Destination traverses a non-container at /${segments.slice(0, index + 1).join("/")}`);
    current = child;
  }
}

export function assertNonConflictingPointers(pointers: string[]): void {
  const parsed = pointers.map((pointer) => ({ pointer, segments: parseJsonPointer(pointer, true) }));
  for (let leftIndex = 0; leftIndex < parsed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < parsed.length; rightIndex += 1) {
      const left = parsed[leftIndex];
      const right = parsed[rightIndex];
      const common = Math.min(left.segments.length, right.segments.length);
      let prefix = true;
      for (let index = 0; index < common; index += 1) {
        if (left.segments[index] !== right.segments[index]) {
          prefix = false;
          break;
        }
      }
      if (prefix && (left.segments.length === common || right.segments.length === common)) {
        throw new Error(`Conflicting destination pointers ${JSON.stringify(left.pointer)} and ${JSON.stringify(right.pointer)}`);
      }
    }
  }
}

export interface SchemaSelection {
  schema: JsonSchemaLite;
  known: boolean;
  guaranteed: boolean;
  error?: string;
}

export function selectSchema(schema: JsonSchemaLite, pointer = ""): SchemaSelection {
  let current = schema;
  let guaranteed = true;
  let known = hasMeaningfulSchema(current);
  let traversed = "";
  let segments: string[];
  try {
    segments = parseJsonPointer(pointer);
  } catch (error) {
    return { schema: {}, known: false, guaranteed: false, error: (error as Error).message };
  }

  for (const segment of segments) {
    traversed += `/${escapePointerSegment(segment)}`;
    if (current.type === "array" || current.items) {
      if (!ARRAY_INDEX.test(segment)) return { schema: {}, known: false, guaranteed: false, error: `${traversed} is not a valid array item pointer` };
      if (!current.items) return { schema: {}, known: false, guaranteed: false };
      current = current.items;
      known = known && hasMeaningfulSchema(current);
      // A schema cannot guarantee a particular runtime array index exists.
      guaranteed = false;
      continue;
    }
    if (current.type === "object" || current.properties || current.required) {
      const child = current.properties?.[segment];
      if (!child) {
        if (current.properties) return { schema: {}, known: false, guaranteed: false, error: `${traversed} is not declared by the source schema` };
        return { schema: {}, known: false, guaranteed: false };
      }
      guaranteed = guaranteed && (current.required ?? []).includes(segment);
      current = child;
      known = known && hasMeaningfulSchema(current);
      continue;
    }
    if (!hasMeaningfulSchema(current)) return { schema: {}, known: false, guaranteed: false };
    return { schema: {}, known: false, guaranteed: false, error: `${traversed} traverses non-container schema type ${current.type ?? "unknown"}` };
  }
  return { schema: current, known, guaranteed };
}

export function hasMeaningfulSchema(schema: JsonSchemaLite): boolean {
  return schema.type !== undefined || schema.enum !== undefined || schema.properties !== undefined || schema.items !== undefined || schema.required !== undefined;
}

export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function createContainer(nextSegment: string): Record<string, unknown> | unknown[] {
  return ARRAY_INDEX.test(nextSegment) ? [] : {};
}
