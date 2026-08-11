import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseProtocolManifest, type ProtocolProvideContract } from "@kybernetria/pi-protocol/contract";
import {
  parsePiAgentProfiles,
  resolvePiAgentProfiles,
  type ResolvedPiAgentProfile,
} from "@kybernetria/pi-protocol/pi/agents";
import type { AgentRole } from "./definition.ts";

export const MANIFEST_BASE_DIR = fileURLToPath(new URL("../..", import.meta.url));

export const protocolDefinition = parseProtocolManifest(
  readFileSync(fileURLToPath(new URL("../../pi.protocol.json", import.meta.url)), "utf8"),
);

export const agentProfiles = resolvePiAgentProfiles(
  parsePiAgentProfiles(readFileSync(fileURLToPath(new URL("../../pi.agents.json", import.meta.url)), "utf8")),
  MANIFEST_BASE_DIR,
);

export const protocolNodeId = protocolDefinition.manifest.node.id;

export function agentProfileFor(role: AgentRole): ResolvedPiAgentProfile {
  const profile = agentProfiles.agents[role];
  if (!profile) throw new Error(`Private deployment profile is missing agent ${role}`);
  return profile;
}

export function provideContractFor(role: AgentRole): ProtocolProvideContract {
  const provide = protocolDefinition.manifest.provides.find((candidate) => candidate.name === role);
  if (!provide) throw new Error(`Public contract is missing provide ${role}`);
  return provide;
}
