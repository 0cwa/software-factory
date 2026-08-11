import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import manifestSchema from "./manifest.schema.json" with { type: "json" };
import { ProtocolContractError } from "./errors.ts";
import { assertBoundedJsonValue } from "./json.ts";
import type { ProtocolContractLimits } from "./limits.ts";
import type {
  CompiledContractValidator,
  CompiledProvideContract,
  ContractIssue,
  JsonValue,
  ProtocolJsonSchema,
  ProtocolManifestV1,
} from "./types.ts";

const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";
const ajv = createAjv();
const validateManifestShape = ajv.compile<ProtocolManifestV1>(manifestSchema);

export function assertCanonicalManifest(value: unknown, limits: ProtocolContractLimits): asserts value is ProtocolManifestV1 {
  if (!validateManifestShape(value)) {
    throw new ProtocolContractError(
      "MANIFEST_INVALID",
      "Protocol manifest does not satisfy the canonical v1 contract",
      normalizeAjvErrors(validateManifestShape.errors, limits.maxDiagnostics),
    );
  }
  assertManifestSemantics(value, limits);
}

export function compileProvideContracts(
  manifest: ProtocolManifestV1,
  limits: ProtocolContractLimits,
): Readonly<Record<string, CompiledProvideContract>> {
  const compiled: Record<string, CompiledProvideContract> = Object.create(null);
  for (let index = 0; index < manifest.provides.length; index += 1) {
    const provide = manifest.provides[index];
    assertAcyclicLocalReferences(provide.inputSchema, manifest.$defs, limits, `/provides/${index}/inputSchema`);
    assertAcyclicLocalReferences(provide.outputSchema, manifest.$defs, limits, `/provides/${index}/outputSchema`);
    const inputSchema = schemaWithManifestDefinitions(provide.inputSchema, manifest.$defs);
    const outputSchema = schemaWithManifestDefinitions(provide.outputSchema, manifest.$defs);
    compiled[provide.name] = Object.freeze({
      target: `${manifest.node.id}.${provide.name}`,
      contract: provide,
      validateInput: compilePayloadValidator(inputSchema, limits, `${provide.name}.inputSchema`),
      validateOutput: compilePayloadValidator(outputSchema, limits, `${provide.name}.outputSchema`),
    });
  }
  return Object.freeze(compiled);
}

function createAjv(): Ajv2020 {
  const instance = new Ajv2020({
    allErrors: false,
    coerceTypes: false,
    strict: true,
    strictTypes: false,
    strictRequired: false,
    useDefaults: false,
    removeAdditional: false,
    validateFormats: false,
    unicodeRegExp: true,
    logger: false,
    ownProperties: true,
  });
  instance.addKeyword({ keyword: "x-pi-sensitive", schemaType: "boolean", valid: true });
  return instance;
}

function compilePayloadValidator(
  schema: Record<string, unknown>,
  limits: ProtocolContractLimits,
  schemaLabel: string,
): CompiledContractValidator {
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(schema);
  } catch {
    throw new ProtocolContractError(
      "SCHEMA_INVALID",
      `Protocol ${schemaLabel} could not be compiled`,
      [{ path: `/${escapePointer(schemaLabel)}`, keyword: "compile", message: "schema compilation failed" }],
    );
  }

  return (value: unknown) => {
    try {
      assertBoundedJsonValue(value, limits);
    } catch (error) {
      if (error instanceof ProtocolContractError) {
        return {
          valid: false,
          issues: Object.freeze([{ path: "", keyword: error.code, message: boundText(error.message) }]),
        };
      }
      return { valid: false, issues: Object.freeze([{ path: "", keyword: "INVALID_JSON_VALUE", message: "Invalid JSON value" }]) };
    }
    try {
      return validate(value)
        ? { valid: true }
        : { valid: false, issues: Object.freeze(normalizeAjvErrors(validate.errors, limits.maxDiagnostics)) };
    } catch {
      return {
        valid: false,
        issues: Object.freeze([{ path: "", keyword: "VALIDATION_FAILED", message: "contract validation did not complete" }]),
      };
    }
  };
}

function schemaWithManifestDefinitions(
  schema: ProtocolJsonSchema,
  manifestDefinitions: Readonly<Record<string, ProtocolJsonSchema>> | undefined,
): Record<string, unknown> {
  const localDefinitions = schema.$defs ?? {};
  const definitions = { ...(manifestDefinitions ?? {}), ...localDefinitions };
  return {
    $schema: JSON_SCHEMA_2020_12,
    ...schema,
    ...(Object.keys(definitions).length > 0 ? { $defs: definitions } : {}),
  };
}

function assertAcyclicLocalReferences(
  rootSchema: ProtocolJsonSchema,
  manifestDefinitions: Readonly<Record<string, ProtocolJsonSchema>> | undefined,
  limits: ProtocolContractLimits,
  rootPath: string,
): void {
  const definitions = { ...(manifestDefinitions ?? {}), ...(rootSchema.$defs ?? {}) };
  const root: ProtocolJsonSchema = { ...rootSchema, ...(Object.keys(definitions).length > 0 ? { $defs: definitions } : {}) };
  const nodes = new Map<string, { schema: ProtocolJsonSchema; children: string[] }>();
  const pending: Array<{ schema: ProtocolJsonSchema; path: string }> = [{ schema: root, path: "#" }];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (nodes.has(current.path)) continue;
    if (nodes.size >= limits.maxSchemaNodes) {
      throw schemaGraphError(rootPath, `schema reference graph exceeds ${limits.maxSchemaNodes} nodes`);
    }
    const children = schemaChildren(current.schema, current.path);
    nodes.set(current.path, { schema: current.schema, children: children.map((child) => child.path) });
    for (const child of children) pending.push(child);
  }

  const states = new Map<string, 1 | 2>();
  for (const start of nodes.keys()) {
    if (states.has(start)) continue;
    const stack: Array<{ path: string; edges: string[]; index: number }> = [];
    states.set(start, 1);
    stack.push({ path: start, edges: referenceEdges(start), index: 0 });
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame.index >= frame.edges.length) {
        states.set(frame.path, 2);
        stack.pop();
        continue;
      }
      const target = frame.edges[frame.index++];
      const targetState = states.get(target);
      if (targetState === 1) throw schemaGraphError(rootPath, "cyclic local schema references are not supported");
      if (targetState === 2) continue;
      states.set(target, 1);
      stack.push({ path: target, edges: referenceEdges(target), index: 0 });
    }
  }

  function referenceEdges(path: string): string[] {
    const node = nodes.get(path)!;
    const edges = [...node.children];
    if (node.schema.$ref) {
      const target = normalizeLocalReference(node.schema.$ref);
      if (!target || !nodes.has(target)) throw schemaGraphError(rootPath, "local schema reference does not resolve to a schema node");
      edges.push(target);
    }
    return edges;
  }
}

function schemaChildren(schema: ProtocolJsonSchema, path: string): Array<{ schema: ProtocolJsonSchema; path: string }> {
  const children: Array<{ schema: ProtocolJsonSchema; path: string }> = [];
  addMap(schema.$defs, "$defs");
  addMap(schema.properties, "properties");
  if (typeof schema.additionalProperties === "object") add(schema.additionalProperties, "additionalProperties");
  if (schema.items) add(schema.items, "items");
  if (schema.contentSchema) add(schema.contentSchema, "contentSchema");
  for (let index = 0; index < (schema.oneOf?.length ?? 0); index += 1) add(schema.oneOf![index], `oneOf/${index}`);
  return children;

  function addMap(map: Readonly<Record<string, ProtocolJsonSchema>> | undefined, segment: string): void {
    if (!map) return;
    for (const [name, child] of Object.entries(map)) add(child, `${segment}/${escapePointer(name)}`);
  }
  function add(child: ProtocolJsonSchema, suffix: string): void {
    children.push({ schema: child, path: `${path}/${suffix}` });
  }
}

function normalizeLocalReference(reference: string): string | undefined {
  if (reference === "#") return "#";
  let pointer: string;
  try { pointer = decodeURIComponent(reference.slice(1)); }
  catch { return undefined; }
  if (!pointer.startsWith("/")) return undefined;
  const tokens = pointer.slice(1).split("/");
  const decoded: string[] = [];
  for (const token of tokens) {
    if (/~(?:[^01]|$)/.test(token)) return undefined;
    decoded.push(token.replaceAll("~1", "/").replaceAll("~0", "~"));
  }
  return `#/${decoded.map(escapePointer).join("/")}`;
}

function schemaGraphError(path: string, message: string): ProtocolContractError {
  return new ProtocolContractError("SCHEMA_INVALID", "Protocol contract schema reference graph is invalid", [
    { path, keyword: "referenceGraph", message },
  ]);
}

function assertManifestSemantics(manifest: ProtocolManifestV1, limits: ProtocolContractLimits): void {
  const issues: ContractIssue[] = [];
  const addIssue = (issue: ContractIssue): void => {
    if (issues.length < limits.maxDiagnostics) issues.push(issue);
  };
  const names = new Set<string>();
  for (let index = 0; index < manifest.provides.length; index += 1) {
    const provide = manifest.provides[index];
    if (names.has(provide.name)) {
      addIssue({ path: `/provides/${index}/name`, keyword: "uniqueProvide", message: "provide name must be unique within its node" });
    }
    names.add(provide.name);
    if (provide.lifecycle?.status === "active" && (
      provide.lifecycle.deprecatedSince !== undefined || provide.lifecycle.sunsetAfter !== undefined || provide.lifecycle.replacement !== undefined
    )) {
      addIssue({ path: `/provides/${index}/lifecycle`, keyword: "lifecycle", message: "active provides cannot declare deprecation scheduling" });
    }
  }
  assertSchemaBudgets(manifest, limits, addIssue);
  if (issues.length > 0) {
    throw new ProtocolContractError("SCHEMA_INVALID", "Protocol contract schemas failed semantic validation", issues);
  }
}

function assertSchemaBudgets(
  manifest: ProtocolManifestV1,
  limits: ProtocolContractLimits,
  addIssue: (issue: ContractIssue) => void,
): void {
  const stack: Array<{ schema: ProtocolJsonSchema; depth: number; path: string }> = [];
  for (const [name, schema] of Object.entries(manifest.$defs ?? {})) {
    checkPrototypeSensitiveName(name, `/$defs/${escapePointer(name)}`, addIssue);
    stack.push({ schema, depth: 1, path: `/$defs/${escapePointer(name)}` });
  }
  for (let index = 0; index < manifest.provides.length; index += 1) {
    stack.push({ schema: manifest.provides[index].inputSchema, depth: 1, path: `/provides/${index}/inputSchema` });
    stack.push({ schema: manifest.provides[index].outputSchema, depth: 1, path: `/provides/${index}/outputSchema` });
  }

  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > limits.maxSchemaNodes) {
      addIssue({ path: current.path, keyword: "schemaBudget", message: `schema graph exceeds ${limits.maxSchemaNodes} nodes` });
      return;
    }
    if (current.depth > limits.maxSchemaDepth) {
      addIssue({ path: current.path, keyword: "schemaBudget", message: `schema depth exceeds ${limits.maxSchemaDepth}` });
      return;
    }
    checkRange(current.schema.minLength, current.schema.maxLength, current.path, "Length", addIssue);
    checkRange(current.schema.minItems, current.schema.maxItems, current.path, "Items", addIssue);
    checkRange(current.schema.minProperties, current.schema.maxProperties, current.path, "Properties", addIssue);
    checkRange(current.schema.minimum, current.schema.maximum, current.path, "imum", addIssue);
    if (current.schema.pattern !== undefined && !isLinearTimePattern(current.schema.pattern)) {
      addIssue({
        path: `${current.path}/pattern`,
        keyword: "patternSafety",
        message: "pattern is outside the bounded linear-time protocol subset",
      });
    }

    checkMapNames(current.schema.$defs, `${current.path}/$defs`, addIssue);
    checkMapNames(current.schema.properties, `${current.path}/properties`, addIssue);
    pushMap(stack, current.schema.$defs, current.depth, `${current.path}/$defs`);
    pushMap(stack, current.schema.properties, current.depth, `${current.path}/properties`);
    if (typeof current.schema.additionalProperties === "object") {
      stack.push({ schema: current.schema.additionalProperties, depth: current.depth + 1, path: `${current.path}/additionalProperties` });
    }
    if (current.schema.items) stack.push({ schema: current.schema.items, depth: current.depth + 1, path: `${current.path}/items` });
    if (current.schema.contentSchema) stack.push({ schema: current.schema.contentSchema, depth: current.depth + 1, path: `${current.path}/contentSchema` });
    for (let index = (current.schema.oneOf?.length ?? 0) - 1; index >= 0; index -= 1) {
      stack.push({ schema: current.schema.oneOf![index], depth: current.depth + 1, path: `${current.path}/oneOf/${index}` });
    }
  }
}

function isLinearTimePattern(pattern: string): boolean {
  let variableQuantifiers = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "\\") {
      const escaped = pattern[index + 1];
      if (escaped === undefined || /[1-9kg]/.test(escaped)) return false;
      index += 1;
      continue;
    }
    if (character === "[") {
      let closed = false;
      for (index += 1; index < pattern.length; index += 1) {
        if (pattern[index] === "\\") {
          if (pattern[index + 1] === undefined) return false;
          index += 1;
          continue;
        }
        if (pattern[index] === "]") {
          closed = true;
          break;
        }
      }
      if (!closed) return false;
      continue;
    }
    if (character === "]" || character === "(" || character === ")" || character === "|") return false;
    if (character === "^" && index !== 0) return false;
    if (character === "$" && index !== pattern.length - 1) return false;
    if (character === "*" || character === "+" || character === "?") {
      variableQuantifiers += 1;
    } else if (character === "{") {
      const match = /^\{([0-9]+)(?:,([0-9]*))?\}/.exec(pattern.slice(index));
      if (!match) return false;
      const minimum = Number(match[1]);
      const hasRange = match[2] !== undefined;
      const maximum = match[2] === "" ? undefined : match[2] === undefined ? minimum : Number(match[2]);
      if (minimum > 1_000 || (maximum !== undefined && (maximum > 1_000 || maximum < minimum))) return false;
      if (hasRange && maximum !== minimum) variableQuantifiers += 1;
      index += match[0].length - 1;
    } else if (character === "}") {
      return false;
    }
    if (variableQuantifiers > 1) return false;
  }
  return variableQuantifiers === 0 || pattern.startsWith("^");
}

function checkMapNames(
  schemas: Readonly<Record<string, ProtocolJsonSchema>> | undefined,
  parentPath: string,
  addIssue: (issue: ContractIssue) => void,
): void {
  if (!schemas) return;
  for (const name of Object.keys(schemas)) checkPrototypeSensitiveName(name, `${parentPath}/${escapePointer(name)}`, addIssue);
}

function checkPrototypeSensitiveName(
  name: string,
  path: string,
  addIssue: (issue: ContractIssue) => void,
): void {
  if (name === "__proto__" || name === "prototype" || name === "constructor") {
    addIssue({ path, keyword: "prototypeSensitiveName", message: "schema map uses a prototype-sensitive name" });
  }
}

function pushMap(
  stack: Array<{ schema: ProtocolJsonSchema; depth: number; path: string }>,
  schemas: Readonly<Record<string, ProtocolJsonSchema>> | undefined,
  parentDepth: number,
  parentPath: string,
): void {
  if (!schemas) return;
  for (const [name, schema] of Object.entries(schemas)) {
    stack.push({ schema, depth: parentDepth + 1, path: `${parentPath}/${escapePointer(name)}` });
  }
}

function checkRange(
  minimum: number | undefined,
  maximum: number | undefined,
  path: string,
  suffix: string,
  addIssue: (issue: ContractIssue) => void,
): void {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    addIssue({ path, keyword: `min${suffix}`, message: `min${suffix} cannot exceed max${suffix}` });
  }
}

function normalizeAjvErrors(errors: ErrorObject[] | null | undefined, limit: number): ContractIssue[] {
  return (errors ?? []).slice(0, limit).map((error) => ({
    path: boundText(error.instancePath || ""),
    keyword: boundText(error.keyword),
    message: boundText(error.message ?? "contract validation failed"),
  }));
}

function boundText(value: string): string {
  return value.length <= 240 ? value : `${value.slice(0, 239)}…`;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
