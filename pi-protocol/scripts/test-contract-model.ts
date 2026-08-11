import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PROTOCOL_CONTRACT_LIMITS,
  ProtocolContractError,
  parseProtocolManifest,
  resolveContractLimits,
  type JsonValue,
  type ProtocolContractErrorCode,
} from "../packages/pi-protocol/contract/index.ts";

const validV1Source = await fixture("valid-v1.json");
const validV1Value = JSON.parse(validV1Source) as Record<string, unknown>;
const definition = parseProtocolManifest(validV1Source);
assert.match(definition.contractDigest, /^sha256:[0-9a-f]{64}$/);
assert.ok(Object.isFrozen(definition));
assert.ok(Object.isFrozen(definition.manifest));
assert.ok(Object.isFrozen(definition.manifest.provides[0].inputSchema));
assert.equal(definition.provides.echo.target, "fixture_node.echo");
assert.deepEqual(definition.provides.echo.validateInput({ text: "hello" }), { valid: true });
assert.equal(definition.provides.echo.validateInput({ text: "" }).valid, false);
assert.equal(definition.provides.echo.validateInput({ text: "hello", extra: true }).valid, false);
assert.equal(definition.provides.echo.validateOutput({ text: "done" }).valid, true);
assert.equal(definition.provides.echo.validateOutput({}).valid, false);

const reordered = reverseObjectKeys(JSON.parse(validV1Source) as JsonValue);
assert.equal(parseProtocolManifest(reordered).contractDigest, definition.contractDigest, "digest must ignore object key order");
const changed = structuredClone(validV1Value);
((changed.provides as Array<Record<string, unknown>>)[0]).description = "Changed promise.";
assert.notEqual(parseProtocolManifest(changed).contractDigest, definition.contractDigest);

const beforeAdmission = JSON.stringify(validV1Value);
parseProtocolManifest(validV1Value);
assert.equal(JSON.stringify(validV1Value), beforeAdmission, "Ajv admission must not mutate caller data");

expectError(() => parseProtocolManifest({ protocolVersion: "0.2.0" }), "UNSUPPORTED_VERSION");

const remoteRef = structuredClone(validV1Value);
((remoteRef.provides as Array<any>)[0]).inputSchema = { $ref: "https://attacker.invalid/schema" };
expectError(() => parseProtocolManifest(remoteRef), "MANIFEST_INVALID");
const missingRef = structuredClone(validV1Value);
((missingRef.provides as Array<any>)[0]).inputSchema = { $ref: "#/$defs/missing" };
expectError(() => parseProtocolManifest(missingRef), "SCHEMA_INVALID");
const localRef = structuredClone(validV1Value) as any;
localRef.$defs = { text: { type: "string", minLength: 1 } };
localRef.provides[0].inputSchema = { $ref: "#/$defs/text" };
const localRefDefinition = parseProtocolManifest(localRef);
assert.equal(localRefDefinition.provides.echo.validateInput("ok").valid, true);
assert.equal(localRefDefinition.provides.echo.validateInput("").valid, false);
const cyclicRef = structuredClone(validV1Value) as any;
cyclicRef.$defs = { loop: { $ref: "#/$defs/loop" } };
cyclicRef.provides[0].inputSchema = { $ref: "#/$defs/loop" };
expectError(() => parseProtocolManifest(cyclicRef), "SCHEMA_INVALID");
const unknownKeyword = structuredClone(validV1Value);
((unknownKeyword.provides as Array<any>)[0]).inputSchema = { type: "string", transform: ["trim"] };
expectError(() => parseProtocolManifest(unknownKeyword), "MANIFEST_INVALID");
const permissiveSensitiveAnnotation = structuredClone(validV1Value);
((permissiveSensitiveAnnotation.provides as Array<any>)[0]).inputSchema.properties.text["x-pi-sensitive"] = false;
expectError(() => parseProtocolManifest(permissiveSensitiveAnnotation), "MANIFEST_INVALID");
const unsafePattern = structuredClone(validV1Value);
((unsafePattern.provides as Array<any>)[0]).inputSchema = { type: "string", pattern: "(a+)+$" };
expectError(() => parseProtocolManifest(unsafePattern), "SCHEMA_INVALID");
const unanchoredRepeat = structuredClone(validV1Value);
((unanchoredRepeat.provides as Array<any>)[0]).inputSchema = { type: "string", pattern: "a*$" };
expectError(() => parseProtocolManifest(unanchoredRepeat), "SCHEMA_INVALID");
const safePattern = structuredClone(validV1Value);
((safePattern.provides as Array<any>)[0]).inputSchema = { type: "string", pattern: "^[a-z0-9_-]+$" };
assert.equal(parseProtocolManifest(safePattern).provides.echo.validateInput("safe_name-1").valid, true);

const duplicateProvides = structuredClone(validV1Value);
(duplicateProvides.provides as Array<unknown>).push(structuredClone((duplicateProvides.provides as Array<unknown>)[0]));
expectError(() => parseProtocolManifest(duplicateProvides), "SCHEMA_INVALID");
expectError(() => parseProtocolManifest(validV1Source.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1')), "INVALID_JSON");
const invalidJsonSecret = "INVALID_JSON_SECRET_SENTINEL";
const invalidJsonError = expectError(() => parseProtocolManifest(`{"secret":"${invalidJsonSecret}",`), "INVALID_JSON");
assert.ok(!`${invalidJsonError.message} ${JSON.stringify(invalidJsonError.issues)}`.includes(invalidJsonSecret));
assert.equal(invalidJsonError.cause, undefined);
expectError(() => parseProtocolManifest({ ...validV1Value, schemaVersion: 2 }), "UNSUPPORTED_VERSION");
expectError(() => parseProtocolManifest({ ...validV1Value, unexpected: true }), "MANIFEST_INVALID");

const nullable = structuredClone(validV1Value);
((nullable.provides as Array<any>)[0]).inputSchema = { type: ["string", "null"], minLength: 1 };
const nullableDefinition = parseProtocolManifest(nullable);
assert.equal(nullableDefinition.provides.echo.validateInput(null).valid, true);
assert.equal(nullableDefinition.provides.echo.validateInput("ok").valid, true);
assert.equal(nullableDefinition.provides.echo.validateInput(1).valid, false);
const broadUnion = structuredClone(nullable);
((broadUnion.provides as Array<any>)[0]).inputSchema.type = ["string", "number"];
expectError(() => parseProtocolManifest(broadUnion), "MANIFEST_INVALID");

const tooManyBranches = structuredClone(validV1Value);
((tooManyBranches.provides as Array<any>)[0]).inputSchema = { oneOf: Array.from({ length: 9 }, () => ({ type: "string" })) };
expectError(() => parseProtocolManifest(tooManyBranches), "MANIFEST_INVALID");
let nestedSchema: Record<string, unknown> = { type: "string" };
for (let index = 0; index < 10; index += 1) nestedSchema = { type: "array", items: nestedSchema };
const deepSchema = structuredClone(validV1Value);
((deepSchema.provides as Array<any>)[0]).inputSchema = nestedSchema;
expectError(() => parseProtocolManifest(deepSchema, { limits: { maxSchemaDepth: 8 } }), "SCHEMA_INVALID");
expectError(() => parseProtocolManifest(validV1Source, { limits: { maxJsonBytes: 128 } }), "BUDGET_EXCEEDED");
assert.equal(resolveContractLimits({ maxJsonBytes: Number.MAX_SAFE_INTEGER }).maxJsonBytes, PROTOCOL_CONTRACT_LIMITS.maxJsonBytes);

expectError(() => parseProtocolManifest({ ...validV1Value, extra: undefined }), "INVALID_JSON_VALUE");
expectError(() => parseProtocolManifest({ ...validV1Value, extra: 1n }), "INVALID_JSON_VALUE");
expectError(() => parseProtocolManifest({ ...validV1Value, extra: Symbol("x") }), "INVALID_JSON_VALUE");
expectError(() => parseProtocolManifest({ ...validV1Value, extra: () => undefined }), "INVALID_JSON_VALUE");
expectError(() => parseProtocolManifest({ ...validV1Value, extra: Number.NaN }), "INVALID_JSON_VALUE");
class NotJson { value = 1; }
expectError(() => parseProtocolManifest(new NotJson()), "INVALID_JSON_VALUE");
expectError(() => parseProtocolManifest(new Proxy(structuredClone(validV1Value), {})), "INVALID_JSON_VALUE");
const nestedProxy = structuredClone(validV1Value) as Record<string, unknown>;
nestedProxy.extensions = new Proxy({ "dev.pi.fixture": true }, {});
expectError(() => parseProtocolManifest(nestedProxy), "INVALID_JSON_VALUE");
const cyclic = structuredClone(validV1Value) as Record<string, unknown>;
cyclic.extensions = cyclic;
expectError(() => parseProtocolManifest(cyclic), "INVALID_JSON_VALUE");

const unsafeProperties = JSON.parse(`{
  "$schema":"https://pi.dev/protocol/manifest-v1.schema.json",
  "schemaVersion":1,
  "node":{"id":"prototype_test","purpose":"Prototype-sensitive property fixture."},
  "provides":[{"name":"read","description":"Read fields.",
    "inputSchema":{"type":"object","additionalProperties":false,"required":["__proto__","constructor"],"properties":{"__proto__":{"type":"string"},"constructor":{"type":"string"}}},
    "outputSchema":{"type":"null"}}]
}`);
expectError(() => parseProtocolManifest(unsafeProperties), "SCHEMA_INVALID");
assert.equal(({} as Record<string, unknown>).polluted, undefined);

const inheritedRequired = structuredClone(validV1Value) as any;
inheritedRequired.provides[0].inputSchema = { type: "object", required: ["toString"], additionalProperties: true };
const inheritedDefinition = parseProtocolManifest(inheritedRequired);
assert.equal(inheritedDefinition.provides.echo.validateInput({}).valid, false, "inherited members cannot satisfy required");
assert.equal(inheritedDefinition.provides.echo.validateInput(JSON.parse('{"toString":"own"}')).valid, true);
const cyclicPayload: Record<string, unknown> = {};
cyclicPayload.self = cyclicPayload;
assert.equal(definition.provides.echo.validateInput(cyclicPayload).valid, false);
assert.equal(definition.provides.echo.validateInput(new Proxy({ text: "hello" }, {})).valid, false);
assert.ok(definition.provides.echo.validateInput({ text: "" }).valid === false);

console.log("canonical contract parsing, budgets, digests, and validators work");

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/contracts/${name}`, import.meta.url), "utf8");
}

function expectError(action: () => unknown, code: ProtocolContractErrorCode): ProtocolContractError {
  let captured: unknown;
  try { action(); }
  catch (error) { captured = error; }
  assert.ok(captured instanceof ProtocolContractError, `expected ProtocolContractError ${code}`);
  assert.equal(captured.code, code);
  assert.ok(captured.issues.length <= PROTOCOL_CONTRACT_LIMITS.maxDiagnostics);
  return captured;
}

function reverseObjectKeys(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).reverse()) {
    Object.defineProperty(result, key, { enumerable: true, configurable: true, writable: true, value: reverseObjectKeys(value[key]) });
  }
  return result;
}
