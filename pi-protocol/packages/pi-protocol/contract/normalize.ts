import type { JsonValue } from "./types.ts";

/** Return a deeply frozen JSON value with deterministically sorted object keys. */
export function normalizeJsonValue<T extends JsonValue>(value: T): T {
  return normalize(value) as T;
}

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function normalize(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") {
    return typeof value === "number" && Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map(normalize)) as unknown as JsonValue[];

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: normalize(value[key]),
    });
  }
  return Object.freeze(result);
}
