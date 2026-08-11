import type { ProtocolDefinition } from "./contract/types.ts";

const DEFINITION_MARK = Symbol.for("@kybernetria/pi-protocol.definition.v1");

/** Internal admission mark shared structurally across compatible package copies. */
export function markAdmittedProtocolDefinition(definition: ProtocolDefinition): void {
  Object.defineProperty(definition, DEFINITION_MARK, { value: true, enumerable: false });
}

export function isAdmittedProtocolDefinition(value: unknown): value is ProtocolDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as ProtocolDefinition & Record<PropertyKey, unknown>;
  return candidate[DEFINITION_MARK] === true
    && Object.isFrozen(candidate)
    && Object.isFrozen(candidate.manifest)
    && candidate.manifest.schemaVersion === 1
    && /^sha256:[0-9a-f]{64}$/.test(candidate.contractDigest)
    && typeof candidate.provides === "object"
    && candidate.provides !== null;
}
