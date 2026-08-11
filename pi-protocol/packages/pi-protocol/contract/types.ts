export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const STANDARD_EFFECTS = [
  "fs.read",
  "fs.write",
  "db.read",
  "db.write",
  "network.read",
  "network.send",
  "process.spawn",
  "model.call",
  "protocol.invoke",
  "external.transaction",
  "system.configure",
] as const;

export type StandardEffect = (typeof STANDARD_EFFECTS)[number];
export type JsonSchemaScalarType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
export type NullableJsonSchemaType = readonly [Exclude<JsonSchemaScalarType, "null">, "null"] | readonly ["null", Exclude<JsonSchemaScalarType, "null">];

/** The bounded JSON Schema 2020-12 profile accepted at the protocol boundary. */
export interface ProtocolJsonSchema {
  $ref?: string;
  $defs?: Readonly<Record<string, ProtocolJsonSchema>>;
  type?: JsonSchemaScalarType | NullableJsonSchemaType;
  required?: readonly string[];
  properties?: Readonly<Record<string, ProtocolJsonSchema>>;
  additionalProperties?: boolean | ProtocolJsonSchema;
  items?: ProtocolJsonSchema;
  enum?: readonly JsonValue[];
  const?: JsonValue;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  oneOf?: readonly ProtocolJsonSchema[];
  title?: string;
  description?: string;
  examples?: readonly JsonValue[];
  contentEncoding?: string;
  contentMediaType?: string;
  contentSchema?: ProtocolJsonSchema;
  "x-pi-sensitive"?: true;
}

export interface ProvideTraits {
  determinism?: "deterministic" | "best_effort";
  replay?: "safe" | "idempotent" | "unsafe";
  interaction?: "request_response" | "continuable" | "background";
  cancellable?: boolean;
  streaming?: boolean;
}

export interface ProtocolLifecycle {
  status: "active" | "deprecated";
  deprecatedSince?: string;
  sunsetAfter?: string;
  replacement?: string;
  message?: string;
}

export interface ProtocolNodeContract {
  id: string;
  purpose: string;
  tags?: readonly string[];
  extensions?: Readonly<Record<string, JsonValue>>;
}

export interface ProtocolProvideContract {
  name: string;
  description: string;
  inputSchema: ProtocolJsonSchema;
  outputSchema: ProtocolJsonSchema;
  tags?: readonly string[];
  effects?: readonly StandardEffect[];
  traits?: ProvideTraits;
  lifecycle?: ProtocolLifecycle;
  extensions?: Readonly<Record<string, JsonValue>>;
}

export interface ProtocolManifestV1 {
  $schema: "https://pi.dev/protocol/manifest-v1.schema.json";
  schemaVersion: 1;
  node: ProtocolNodeContract;
  $defs?: Readonly<Record<string, ProtocolJsonSchema>>;
  provides: readonly ProtocolProvideContract[];
  extensions?: Readonly<Record<string, JsonValue>>;
}

export type ProtocolContractErrorCode =
  | "INVALID_JSON"
  | "INVALID_JSON_VALUE"
  | "BUDGET_EXCEEDED"
  | "UNSUPPORTED_VERSION"
  | "MANIFEST_INVALID"
  | "SCHEMA_INVALID";

export interface ContractIssue {
  path: string;
  keyword: string;
  message: string;
}

export type ContractValidationResult =
  | { valid: true }
  | { valid: false; issues: readonly ContractIssue[] };

export interface CompiledContractValidator {
  (value: unknown): ContractValidationResult;
}

export interface CompiledProvideContract {
  readonly target: string;
  readonly contract: ProtocolProvideContract;
  readonly validateInput: CompiledContractValidator;
  readonly validateOutput: CompiledContractValidator;
}

export interface ProtocolDefinition {
  readonly manifest: ProtocolManifestV1;
  readonly contractDigest: string;
  readonly provides: Readonly<Record<string, CompiledProvideContract>>;
}
