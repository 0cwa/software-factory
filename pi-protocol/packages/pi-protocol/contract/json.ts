import { types as utilTypes } from "node:util";
import { ProtocolContractError } from "./errors.ts";
import type { ProtocolContractLimits } from "./limits.ts";
import type { JsonValue } from "./types.ts";

export function parseJsonSource(source: string, limits: ProtocolContractLimits): JsonValue {
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes > limits.maxJsonBytes) {
    throw budgetError(`Manifest JSON exceeds the ${limits.maxJsonBytes} byte limit`);
  }
  rejectDuplicateObjectKeys(source);
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ProtocolContractError("INVALID_JSON", "Manifest is not valid JSON");
  }
  return assertBoundedJsonValue(value, limits);
}

/** Validate the strict JSON boundary without stringifying an unbounded value. */
export function assertBoundedJsonValue(value: unknown, limits: ProtocolContractLimits): JsonValue {
  const stack: Array<{ value: unknown; depth: number; exit?: boolean }> = [{ value, depth: 1 }];
  const activeAncestors = new WeakSet<object>();
  let nodes = 0;
  let estimatedBytes = 0;

  const addBytes = (amount: number): void => {
    estimatedBytes += amount;
    if (estimatedBytes > limits.maxJsonBytes) {
      throw budgetError(`JSON value exceeds the ${limits.maxJsonBytes} byte limit`);
    }
  };

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.exit) {
      activeAncestors.delete(current.value as object);
      continue;
    }
    nodes += 1;
    if (nodes > limits.maxJsonNodes) throw budgetError(`JSON value exceeds the ${limits.maxJsonNodes} node limit`);
    if (current.depth > limits.maxJsonDepth) throw budgetError(`JSON value exceeds the depth limit of ${limits.maxJsonDepth}`);

    const item = current.value;
    if (item === null) {
      addBytes(4);
      continue;
    }
    if (typeof item === "string") {
      const rawBytes = Buffer.byteLength(item, "utf8");
      if (rawBytes > limits.maxStringBytes) throw budgetError(`JSON string exceeds the ${limits.maxStringBytes} byte limit`);
      addBytes(Buffer.byteLength(JSON.stringify(item), "utf8"));
      continue;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw invalidValue("JSON numbers must be finite");
      addBytes(String(Object.is(item, -0) ? 0 : item).length);
      continue;
    }
    if (typeof item === "boolean") {
      addBytes(item ? 4 : 5);
      continue;
    }
    if (typeof item !== "object") throw invalidValue(`JSON cannot contain ${typeof item} values`);
    if (utilTypes.isProxy(item)) throw invalidValue("JSON values cannot contain Proxy objects");
    if (activeAncestors.has(item)) throw invalidValue("JSON values cannot be cyclic");
    activeAncestors.add(item);
    stack.push({ value: item, depth: current.depth, exit: true });

    try {
      if (Array.isArray(item)) {
        if (item.length > limits.maxCollectionEntries) {
          throw budgetError(`JSON array exceeds the ${limits.maxCollectionEntries} item limit`);
        }
        if (Object.getOwnPropertySymbols(item).length > 0) throw invalidValue("JSON arrays cannot have symbol properties");
        const ownNames = Object.getOwnPropertyNames(item);
        if (ownNames.some((name) => name !== "length" && !isArrayIndex(name, item.length))) {
          throw invalidValue("JSON arrays cannot have named properties");
        }
        addBytes(2 + Math.max(0, item.length - 1));
        for (let index = item.length - 1; index >= 0; index -= 1) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            throw invalidValue("JSON arrays must be dense data arrays");
          }
          stack.push({ value: descriptor.value, depth: current.depth + 1 });
        }
        continue;
      }

      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw invalidValue("JSON objects must be ordinary objects or null-prototype objects");
      }
      if (Object.getOwnPropertySymbols(item).length > 0) throw invalidValue("JSON objects cannot have symbol properties");
      const names = Object.getOwnPropertyNames(item);
      if (names.length > limits.maxCollectionEntries) {
        throw budgetError(`JSON object exceeds the ${limits.maxCollectionEntries} property limit`);
      }
      addBytes(2 + Math.max(0, names.length - 1));
      for (let index = names.length - 1; index >= 0; index -= 1) {
        const name = names[index];
        const nameBytes = Buffer.byteLength(name, "utf8");
        if (nameBytes > limits.maxStringBytes) throw budgetError(`JSON property name exceeds the ${limits.maxStringBytes} byte limit`);
        const descriptor = Object.getOwnPropertyDescriptor(item, name);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw invalidValue("JSON objects must contain only enumerable data properties");
        }
        addBytes(Buffer.byteLength(JSON.stringify(name), "utf8") + 1);
        stack.push({ value: descriptor.value, depth: current.depth + 1 });
      }
    } catch (error) {
      if (error instanceof ProtocolContractError) throw error;
      throw invalidValue("JSON object inspection failed");
    }
  }

  return value as JsonValue;
}

function rejectDuplicateObjectKeys(source: string): void {
  const stack: Array<{ type: "object"; keys: Set<string> } | { type: "array" }> = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      stack.push({ type: "object", keys: new Set() });
      continue;
    }
    if (character === "[") {
      stack.push({ type: "array" });
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      continue;
    }
    if (character !== '"') continue;

    const end = findStringEnd(source, index);
    let next = end + 1;
    while (next < source.length && /\s/.test(source[next])) next += 1;
    const context = stack[stack.length - 1];
    if (context?.type === "object" && source[next] === ":") {
      let key: string;
      try {
        key = JSON.parse(source.slice(index, end + 1));
      } catch {
        throw new ProtocolContractError("INVALID_JSON", "Manifest is not valid JSON");
      }
      if (context.keys.has(key)) {
        throw new ProtocolContractError("INVALID_JSON", "Manifest contains a duplicate object member");
      }
      context.keys.add(key);
    }
    index = end;
  }
}

function findStringEnd(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === '"') return index;
  }
  throw new ProtocolContractError("INVALID_JSON", "Manifest is not valid JSON");
}

function isArrayIndex(name: string, length: number): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/.test(name)) return false;
  const index = Number(name);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === name;
}

function budgetError(message: string): ProtocolContractError {
  return new ProtocolContractError("BUDGET_EXCEEDED", message);
}

function invalidValue(message: string): ProtocolContractError {
  return new ProtocolContractError("INVALID_JSON_VALUE", message);
}
