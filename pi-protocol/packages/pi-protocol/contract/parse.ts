import { markAdmittedProtocolDefinition } from "../definition-abi.ts";
import { ProtocolContractError } from "./errors.ts";
import { fingerprintProtocolManifest } from "./fingerprint.ts";
import { assertBoundedJsonValue, parseJsonSource } from "./json.ts";
import { normalizeJsonValue } from "./normalize.ts";
import {
  resolveContractLimits,
  type ProtocolContractLimitOverrides,
} from "./limits.ts";
import { assertCanonicalManifest, compileProvideContracts } from "./validate.ts";
import type { JsonValue, ProtocolDefinition, ProtocolManifestV1 } from "./types.ts";

export interface ParseProtocolManifestOptions {
  /** Limits can only be tightened below the protocol ceilings. */
  limits?: ProtocolContractLimitOverrides;
}

/** Admit one canonical schema-version-1 protocol contract. */
export function parseProtocolManifest(source: string | unknown, options: ParseProtocolManifestOptions = {}): ProtocolDefinition {
  const limits = resolveContractLimits(options.limits);
  const value = typeof source === "string"
    ? parseJsonSource(source, limits)
    : assertBoundedJsonValue(source, limits);

  if (!isRecord(value)) {
    throw new ProtocolContractError("MANIFEST_INVALID", "Protocol manifest must be a JSON object");
  }
  if (value.schemaVersion !== 1) {
    throw new ProtocolContractError("UNSUPPORTED_VERSION", "Protocol manifest schemaVersion is not supported");
  }

  assertCanonicalManifest(value, limits);
  const manifest = normalizeJsonValue(value as unknown as JsonValue) as unknown as ProtocolManifestV1;
  const definition: ProtocolDefinition = {
    manifest,
    contractDigest: fingerprintProtocolManifest(manifest),
    provides: compileProvideContracts(manifest, limits),
  };
  markAdmittedProtocolDefinition(definition);
  return Object.freeze(definition);
}

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
