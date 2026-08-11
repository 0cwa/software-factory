export { ProtocolContractError } from "./errors.ts";
export { fingerprintProtocolManifest } from "./fingerprint.ts";
export {
  PROTOCOL_CONTRACT_LIMITS,
  resolveContractLimits,
  type ProtocolContractLimitOverrides,
  type ProtocolContractLimits,
} from "./limits.ts";
export { canonicalJson, normalizeJsonValue } from "./normalize.ts";
export { parseProtocolManifest, type ParseProtocolManifestOptions } from "./parse.ts";
export { STANDARD_EFFECTS } from "./types.ts";
export type {
  CompiledContractValidator,
  CompiledProvideContract,
  ContractIssue,
  ContractValidationResult,
  JsonPrimitive,
  JsonSchemaScalarType,
  JsonValue,
  NullableJsonSchemaType,
  ProtocolContractErrorCode,
  ProtocolDefinition,
  ProtocolJsonSchema,
  ProtocolLifecycle,
  ProtocolManifestV1,
  ProtocolNodeContract,
  ProtocolProvideContract,
  ProvideTraits,
  StandardEffect,
} from "./types.ts";

export const CANONICAL_MANIFEST_SCHEMA_ID = "https://pi.dev/protocol/manifest-v1.schema.json" as const;
export const CANONICAL_MANIFEST_SCHEMA_VERSION = 1 as const;
