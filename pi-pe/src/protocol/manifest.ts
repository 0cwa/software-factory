import { readFileSync } from "node:fs";
import { parseProtocolManifest, type ProtocolDefinition } from "@kybernetria/pi-protocol/contract";

export function loadManagementProtocol(
  url = new URL("../../pi.protocol.json", import.meta.url),
): ProtocolDefinition {
  return parseProtocolManifest(readFileSync(url, "utf8"));
}

export const loadManagementDefinition = loadManagementProtocol;
