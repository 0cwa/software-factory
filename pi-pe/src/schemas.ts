import type {
  Binding,
  JsonSchemaLite,
  DependencySnapshot,
  Issue,
  JsonValue,
  PipelineLimits,
  PipelineSpecV1,
  PipelineStepV1,
  ValueSource,
} from "./types.ts";

const SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);
const SAFE_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TARGET = /^([a-z0-9][a-z0-9_-]*)\.([a-z0-9][a-z0-9_-]*)$/;
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export const GENERATED_NODE_PREFIX = "pi_pe_pipeline_";
export const GENERATED_RUN_PROVIDE = "run";

export function isSafeId(value: string): boolean {
  return SAFE_NAME.test(value);
}

export function generatedNodeId(id: string): string {
  if (!isSafeId(id)) throw new Error(`Unsafe pipeline id: ${JSON.stringify(id)}`);
  return `${GENERATED_NODE_PREFIX}${id}`;
}

export function generatedTarget(id: string): string {
  return `${generatedNodeId(id)}.${GENERATED_RUN_PROVIDE}`;
}

export function parseTarget(target: string): { nodeId: string; provide: string } | undefined {
  const match = TARGET.exec(target);
  return match ? { nodeId: match[1], provide: match[2] } : undefined;
}

export function validateJsonSchemaDefinition(schema: unknown, path = "schema", issues: Issue[] = []): schema is JsonSchemaLite {
  if (!isPlainObject(schema)) {
    issues.push({ code: "INVALID_SCHEMA", message: `${path} must be an object`, path });
    return false;
  }

  let valid = true;
  for (const key of Object.keys(schema)) {
    if (!["type", "required", "properties", "additionalProperties", "items", "enum", "description"].includes(key)) {
      issues.push({ code: "UNSUPPORTED_SCHEMA_KEY", message: `${path}.${key} is not supported by JsonSchemaLite`, path: `${path}/${key}` });
      valid = false;
    }
  }
  if (schema.type !== undefined && (typeof schema.type !== "string" || !SCHEMA_TYPES.has(schema.type))) {
    issues.push({ code: "INVALID_SCHEMA_TYPE", message: `${path}.type is invalid`, path: `${path}/type` });
    valid = false;
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    issues.push({ code: "INVALID_SCHEMA_ADDITIONAL_PROPERTIES", message: `${path}.additionalProperties must be boolean`, path: `${path}/additionalProperties` });
    valid = false;
  }
  if (schema.description !== undefined && typeof schema.description !== "string") {
    issues.push({ code: "INVALID_SCHEMA_DESCRIPTION", message: `${path}.description must be a string`, path: `${path}/description` });
    valid = false;
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string" || !item)) {
      issues.push({ code: "INVALID_SCHEMA_REQUIRED", message: `${path}.required must contain non-empty strings`, path: `${path}/required` });
      valid = false;
    } else if (new Set(schema.required).size !== schema.required.length) {
      issues.push({ code: "INVALID_SCHEMA_REQUIRED", message: `${path}.required contains duplicates`, path: `${path}/required` });
      valid = false;
    }
  }
  if (schema.properties !== undefined) {
    if (!isPlainObject(schema.properties)) {
      issues.push({ code: "INVALID_SCHEMA_PROPERTIES", message: `${path}.properties must be an object`, path: `${path}/properties` });
      valid = false;
    } else {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (!key || BLOCKED_KEYS.has(key)) {
          issues.push({ code: "UNSAFE_SCHEMA_PROPERTY", message: `${path}.properties contains unsafe key ${JSON.stringify(key)}`, path: `${path}/properties/${key}` });
          valid = false;
          continue;
        }
        valid = validateJsonSchemaDefinition(child, `${path}.properties.${key}`, issues) && valid;
      }
    }
  }
  if (schema.items !== undefined) valid = validateJsonSchemaDefinition(schema.items, `${path}.items`, issues) && valid;
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.some((item) => !isJsonValue(item))) {
      issues.push({ code: "INVALID_SCHEMA_ENUM", message: `${path}.enum must be a non-empty array of JSON values`, path: `${path}/enum` });
      valid = false;
    }
  }
  if ((schema.type === "object" || schema.required !== undefined) && schema.items !== undefined) {
    issues.push({ code: "INVALID_SCHEMA_SHAPE", message: `${path} mixes object and array keywords`, path });
    valid = false;
  }
  if (schema.type && schema.type !== "object" && (schema.required !== undefined || schema.properties !== undefined || schema.additionalProperties !== undefined)) {
    issues.push({ code: "INVALID_SCHEMA_SHAPE", message: `${path} uses object keywords with type ${schema.type}`, path });
    valid = false;
  }
  if (schema.type && schema.type !== "array" && schema.items !== undefined) {
    issues.push({ code: "INVALID_SCHEMA_SHAPE", message: `${path} uses items with type ${schema.type}`, path });
    valid = false;
  }
  return valid;
}

export function validateJsonSchemaValue(schema: JsonSchemaLite, value: unknown, path = "value"): string | undefined {
  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) {
    return `${path} must be one of ${JSON.stringify(schema.enum)}`;
  }
  if (schema.type && !matchesType(schema.type, value)) return `${path} must be ${schema.type}`;
  if (schema.type === "object" || schema.required || schema.properties) {
    if (!isPlainObject(value)) return `${path} must be object`;
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return `${path}.${key} is required`;
    }
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      const extra = Object.keys(value).find((key) => !known.has(key));
      if (extra) return `${path}.${extra} is not allowed`;
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const error = validateJsonSchemaValue(child, value[key], `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  if (schema.type === "array" || schema.items) {
    if (!Array.isArray(value)) return `${path} must be array`;
    if (schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        const error = validateJsonSchemaValue(schema.items, value[index], `${path}[${index}]`);
        if (error) return error;
      }
    }
  }
  return undefined;
}

export function parsePipelineSpec(value: unknown): { spec?: PipelineSpecV1; errors: Issue[] } {
  const errors: Issue[] = [];
  if (!isPlainObject(value)) return { errors: [{ code: "INVALID_SPEC", message: "pipeline spec must be an object", path: "" }] };

  requireExactKeys(value, new Set([
    "schemaVersion", "id", "version", "name", "description", "tags", "inputSchema", "outputSchema", "limits",
    "dependencyPolicy", "steps", "output", "createdAt", "updatedAt", "dependencies", "review",
  ]), "", errors);
  if (value.schemaVersion !== 1) issue(errors, "INVALID_SCHEMA_VERSION", "schemaVersion must be 1", "/schemaVersion");
  requiredString(value, "id", errors);
  requiredString(value, "version", errors);
  requiredString(value, "name", errors);
  requiredString(value, "description", errors);
  requiredString(value, "createdAt", errors);
  requiredString(value, "updatedAt", errors);
  if (typeof value.id === "string" && !isSafeId(value.id)) issue(errors, "INVALID_ID", "id must use 1-64 lowercase letters, numbers, underscores, or dashes and may not be path-like", "/id");
  if (typeof value.createdAt === "string" && !isIsoDate(value.createdAt)) issue(errors, "INVALID_TIMESTAMP", "createdAt must be an ISO-8601 timestamp", "/createdAt");
  if (typeof value.updatedAt === "string" && !isIsoDate(value.updatedAt)) issue(errors, "INVALID_TIMESTAMP", "updatedAt must be an ISO-8601 timestamp", "/updatedAt");

  if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    issue(errors, "INVALID_TAGS", "tags must be an array of non-empty strings", "/tags");
  } else if (new Set(value.tags).size !== value.tags.length) issue(errors, "INVALID_TAGS", "tags must not contain duplicates", "/tags");

  validateJsonSchemaDefinition(value.inputSchema, "inputSchema", errors);
  validateJsonSchemaDefinition(value.outputSchema, "outputSchema", errors);
  if (value.dependencyPolicy !== undefined && value.dependencyPolicy !== "pinned" && value.dependencyPolicy !== "compatible") {
    issue(errors, "INVALID_DEPENDENCY_POLICY", "dependencyPolicy must be pinned or compatible", "/dependencyPolicy");
  }
  if (value.limits !== undefined) validateLimits(value.limits, errors);
  if (!Array.isArray(value.steps)) issue(errors, "INVALID_STEPS", "steps must be an array", "/steps");
  else value.steps.forEach((step, index) => validateStep(step, index, errors));
  if (value.output !== undefined) validateValueSource(value.output, "/output", errors);
  if (value.dependencies !== undefined) validateDependencies(value.dependencies, errors);
  if (value.review !== undefined) {
    if (!isPlainObject(value.review) || typeof value.review.runtimeOnly !== "boolean" || typeof value.review.reviewedAt !== "string" || !isIsoDate(value.review.reviewedAt)) {
      issue(errors, "INVALID_REVIEW", "review must contain runtimeOnly and an ISO reviewedAt timestamp", "/review");
    }
  }

  if (errors.length > 0) return { errors };
  return { spec: deepCloneJson(value) as unknown as PipelineSpecV1, errors };
}

function validateLimits(value: unknown, errors: Issue[]): value is PipelineLimits {
  if (!isPlainObject(value)) {
    issue(errors, "INVALID_LIMITS", "limits must be an object", "/limits");
    return false;
  }
  requireExactKeys(value, new Set(["timeoutMs", "maxSteps", "maxIntermediateBytes", "maxNestedDepth", "maxInvocations"]), "/limits", errors);
  for (const key of Object.keys(value)) {
    if (!Number.isInteger(value[key]) || (value[key] as number) <= 0) issue(errors, "INVALID_LIMIT", `${key} must be a positive integer`, `/limits/${key}`);
  }
  return true;
}

function validateStep(value: unknown, index: number, errors: Issue[]): value is PipelineStepV1 {
  const path = `/steps/${index}`;
  if (!isPlainObject(value)) {
    issue(errors, "INVALID_STEP", "step must be an object", path);
    return false;
  }
  requireExactKeys(value, new Set(["id", "target", "input", "timeoutMs"]), path, errors);
  requiredString(value, "id", errors, path);
  requiredString(value, "target", errors, path);
  if (typeof value.id === "string" && !isSafeId(value.id)) issue(errors, "INVALID_STEP_ID", "step id must be a safe lowercase name", `${path}/id`);
  if (typeof value.target === "string" && !parseTarget(value.target)) issue(errors, "INVALID_TARGET", "target must be exact nodeId.provide", `${path}/target`);
  if (value.timeoutMs !== undefined && (!Number.isInteger(value.timeoutMs) || (value.timeoutMs as number) <= 0)) issue(errors, "INVALID_TIMEOUT", "timeoutMs must be a positive integer", `${path}/timeoutMs`);
  if (!isPlainObject(value.input)) {
    issue(errors, "INVALID_STEP_INPUT", "step input must be an object", `${path}/input`);
    return false;
  }
  if (value.input.mode === "pass") {
    requireExactKeys(value.input, new Set(["mode", "from"]), `${path}/input`, errors);
    validateValueSource(value.input.from, `${path}/input/from`, errors);
  } else if (value.input.mode === "object") {
    requireExactKeys(value.input, new Set(["mode", "bindings", "constants"]), `${path}/input`, errors);
    if (!Array.isArray(value.input.bindings)) issue(errors, "INVALID_BINDINGS", "bindings must be an array", `${path}/input/bindings`);
    else value.input.bindings.forEach((binding, bindingIndex) => validateBinding(binding, `${path}/input/bindings/${bindingIndex}`, errors));
    if (value.input.constants !== undefined) {
      if (!Array.isArray(value.input.constants)) issue(errors, "INVALID_CONSTANTS", "constants must be an array", `${path}/input/constants`);
      else value.input.constants.forEach((constant, constantIndex) => {
        const constantPath = `${path}/input/constants/${constantIndex}`;
        if (!isPlainObject(constant)) issue(errors, "INVALID_CONSTANT", "constant must be an object", constantPath);
        else {
          requireExactKeys(constant, new Set(["to", "value"]), constantPath, errors);
          if (typeof constant.to !== "string") issue(errors, "INVALID_POINTER", "constant.to must be a JSON Pointer", `${constantPath}/to`);
          if (!("value" in constant) || !isJsonValue(constant.value)) issue(errors, "INVALID_CONSTANT", "constant.value must be a JSON value", `${constantPath}/value`);
        }
      });
    }
  } else issue(errors, "INVALID_MAPPING_MODE", "step input mode must be pass or object", `${path}/input/mode`);
  return true;
}

function validateBinding(value: unknown, path: string, errors: Issue[]): value is Binding {
  if (!isPlainObject(value)) {
    issue(errors, "INVALID_BINDING", "binding must be an object", path);
    return false;
  }
  requireExactKeys(value, new Set(["to", "from", "required"]), path, errors);
  if (typeof value.to !== "string") issue(errors, "INVALID_POINTER", "binding.to must be a JSON Pointer", `${path}/to`);
  validateValueSource(value.from, `${path}/from`, errors);
  if (value.required !== undefined && typeof value.required !== "boolean") issue(errors, "INVALID_BINDING", "required must be boolean", `${path}/required`);
  return true;
}

function validateValueSource(value: unknown, path: string, errors: Issue[]): value is ValueSource {
  if (!isPlainObject(value)) {
    issue(errors, "INVALID_SOURCE", "value source must be an object", path);
    return false;
  }
  if (value.source === "step") {
    requireExactKeys(value, new Set(["source", "stepId", "pointer"]), path, errors);
    if (typeof value.stepId !== "string" || !isSafeId(value.stepId)) issue(errors, "INVALID_SOURCE", "step source requires a safe stepId", `${path}/stepId`);
  } else if (value.source === "pipeline_input" || value.source === "previous") {
    requireExactKeys(value, new Set(["source", "pointer"]), path, errors);
  } else issue(errors, "INVALID_SOURCE", "source must be pipeline_input, previous, or step", `${path}/source`);
  if (value.pointer !== undefined && typeof value.pointer !== "string") issue(errors, "INVALID_POINTER", "pointer must be a string", `${path}/pointer`);
  return true;
}

function validateDependencies(value: unknown, errors: Issue[]): value is DependencySnapshot[] {
  if (!Array.isArray(value)) {
    issue(errors, "INVALID_DEPENDENCIES", "dependencies must be an array", "/dependencies");
    return false;
  }
  const seen = new Set<string>();
  value.forEach((dependency, index) => {
    const path = `/dependencies/${index}`;
    if (!isPlainObject(dependency)) {
      issue(errors, "INVALID_DEPENDENCY", "dependency must be an object", path);
      return;
    }
    requireExactKeys(dependency, new Set([
      "target", "nodeId", "provide", "packageId", "nodeVersion", "provideVersion", "execution", "effects",
      "inputSchema", "outputSchema", "fingerprint",
    ]), path, errors);
    for (const key of ["target", "nodeId", "provide", "fingerprint"] as const) requiredString(dependency, key, errors, path);
    for (const key of ["packageId", "nodeVersion", "provideVersion"] as const) {
      if (dependency[key] !== undefined && (typeof dependency[key] !== "string" || !(dependency[key] as string).trim())) {
        issue(errors, "INVALID_DEPENDENCY", `${key} must be a non-empty string when present`, `${path}/${key}`);
      }
    }
    const target = typeof dependency.target === "string" ? parseTarget(dependency.target) : undefined;
    if (!target) issue(errors, "INVALID_DEPENDENCY", "dependency target is invalid", `${path}/target`);
    else {
      if (dependency.nodeId !== target.nodeId || dependency.provide !== target.provide) issue(errors, "INVALID_DEPENDENCY", "dependency target does not match nodeId/provide", path);
      if (seen.has(dependency.target as string)) issue(errors, "INVALID_DEPENDENCY", `duplicate dependency ${dependency.target as string}`, `${path}/target`);
      seen.add(dependency.target as string);
    }
    if (!isPlainObject(dependency.execution) || (dependency.execution.type !== "handler" && dependency.execution.type !== "agent")) {
      issue(errors, "INVALID_DEPENDENCY", "dependency execution is invalid", `${path}/execution`);
    } else if (dependency.execution.type === "handler") {
      requireExactKeys(dependency.execution, new Set(["type", "handler"]), `${path}/execution`, errors);
      if (typeof dependency.execution.handler !== "string" || !dependency.execution.handler) issue(errors, "INVALID_DEPENDENCY", "handler execution requires handler", `${path}/execution/handler`);
    } else {
      requireExactKeys(dependency.execution, new Set(["type", "agent"]), `${path}/execution`, errors);
      if (typeof dependency.execution.agent !== "string" || !dependency.execution.agent) issue(errors, "INVALID_DEPENDENCY", "agent execution requires agent", `${path}/execution/agent`);
    }
    if (!Array.isArray(dependency.effects) || dependency.effects.some((effect) => typeof effect !== "string" || !effect)) issue(errors, "INVALID_DEPENDENCY", "dependency effects must be non-empty strings", `${path}/effects`);
    else if (new Set(dependency.effects).size !== dependency.effects.length) issue(errors, "INVALID_DEPENDENCY", "dependency effects contain duplicates", `${path}/effects`);
    if (typeof dependency.fingerprint === "string" && !/^[a-f0-9]{64}$/.test(dependency.fingerprint)) issue(errors, "INVALID_DEPENDENCY", "dependency fingerprint must be SHA-256 hex", `${path}/fingerprint`);
    validateJsonSchemaDefinition(dependency.inputSchema, `${path}.inputSchema`, errors);
    validateJsonSchemaDefinition(dependency.outputSchema, `${path}.outputSchema`, errors);
  });
  return true;
}

function requireExactKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, errors: Issue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issue(errors, "UNKNOWN_FIELD", `unknown field ${key}`, `${path}/${key}`);
  }
}

function requiredString(value: Record<string, unknown>, key: string, errors: Issue[], prefix = ""): void {
  if (typeof value[key] !== "string" || !(value[key] as string).trim()) issue(errors, "INVALID_FIELD", `${key} must be a non-empty string`, `${prefix}/${key}`);
}

function issue(errors: Issue[], code: string, message: string, path: string): void {
  errors.push({ code, message, path });
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen));
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([key, item]) => !BLOCKED_KEYS.has(key) && isJsonValue(item, seen));
}

export function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value as Readonly<T>;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value as Readonly<T>;
}

export function jsonByteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  return Buffer.byteLength(serialized === undefined ? "undefined" : serialized, "utf8");
}

function matchesType(type: JsonSchemaLite["type"], value: unknown): boolean {
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "object": return isPlainObject(value);
    case "array": return Array.isArray(value);
    case "null": return value === null;
    case undefined: return true;
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  return canonicalStringify(left) === canonicalStringify(right);
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
