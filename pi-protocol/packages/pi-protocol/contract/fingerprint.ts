import { createHash } from "node:crypto";
import { canonicalJson } from "./normalize.ts";
import type { JsonValue, ProtocolManifestV1 } from "./types.ts";

export function fingerprintProtocolManifest(manifest: ProtocolManifestV1): string {
  const digest = createHash("sha256").update(canonicalJson(manifest as unknown as JsonValue)).digest("hex");
  return `sha256:${digest}`;
}
