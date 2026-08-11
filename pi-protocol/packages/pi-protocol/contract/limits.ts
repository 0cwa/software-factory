import { ProtocolContractError } from "./errors.ts";

export interface ProtocolContractLimits {
  readonly maxJsonBytes: number;
  readonly maxJsonDepth: number;
  readonly maxJsonNodes: number;
  readonly maxCollectionEntries: number;
  readonly maxStringBytes: number;
  readonly maxSchemaDepth: number;
  readonly maxSchemaNodes: number;
  readonly maxDiagnostics: number;
}

export const PROTOCOL_CONTRACT_LIMITS: ProtocolContractLimits = Object.freeze({
  maxJsonBytes: 1_048_576,
  maxJsonDepth: 64,
  maxJsonNodes: 50_000,
  maxCollectionEntries: 2_048,
  maxStringBytes: 262_144,
  maxSchemaDepth: 32,
  maxSchemaNodes: 20_000,
  maxDiagnostics: 20,
});

export type ProtocolContractLimitOverrides = Partial<ProtocolContractLimits>;

/** Callers may tighten admission limits, but cannot broaden the protocol ceilings. */
export function resolveContractLimits(overrides: ProtocolContractLimitOverrides | undefined): ProtocolContractLimits {
  if (!overrides) return PROTOCOL_CONTRACT_LIMITS;
  const result = { ...PROTOCOL_CONTRACT_LIMITS };
  for (const key of Object.keys(PROTOCOL_CONTRACT_LIMITS) as Array<keyof ProtocolContractLimits>) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ProtocolContractError("BUDGET_EXCEEDED", `Contract limit ${key} must be a positive safe integer`);
    }
    result[key] = Math.min(value, PROTOCOL_CONTRACT_LIMITS[key]);
  }
  return Object.freeze(result);
}
