import type { ProtocolAgentExecutor } from "@kybernetria/pi-protocol/core";
import { createPiSdkAgentExecutorsFromProfiles } from "@kybernetria/pi-protocol/pi/agents";
import { architectDefinition, reviewerDefinition, scoutDefinition, securityReviewerDefinition, workerDefinition } from "../src/roles/index.ts";
import type { AgentDefinition, AgentRole } from "../src/runtime/definition.ts";
import { agentProfiles, protocolDefinition, provideContractFor } from "../src/runtime/manifest.ts";
import {
  parseAgentOutput,
  prepareAgentInput,
  type PreparedAgentInput,
} from "../src/runtime/run-agent.ts";
import type { AgentOutputBase, AgentRequestBase } from "../src/types.ts";

function createProfileAgentExecutor<
  Request extends AgentRequestBase,
  Output extends AgentOutputBase,
>(definition: AgentDefinition<Request, Output>): ProtocolAgentExecutor {
  const provide = provideContractFor(definition.role);
  const sdkExecutor = createPiSdkAgentExecutorsFromProfiles(protocolDefinition, agentProfiles, {
    agentByProvide: { [definition.role]: definition.role },
    toPromptByAgent: () => (input: unknown) => (input as PreparedAgentInput<Request>).prompt,
    toOutputByAgent: () => (text: string, input: unknown) =>
      parseAgentOutput<Output>(text, input as PreparedAgentInput<Request>),
  })[definition.role];
  if (!sdkExecutor) throw new Error(`Private profile did not produce executor ${definition.role}`);

  return (input, context) => {
    const prepared = prepareAgentInput(definition, input as Request, provide);
    return sdkExecutor(prepared, context);
  };
}

const definitions: Record<AgentRole, AgentDefinition<AgentRequestBase, AgentOutputBase>> = {
  scout: scoutDefinition,
  architect: architectDefinition,
  worker: workerDefinition,
  reviewer: reviewerDefinition,
  security_reviewer: securityReviewerDefinition,
};

/** All production roles use the unmodified standard profile-backed session factory. */
export function createAgentExecutors(): Record<string, ProtocolAgentExecutor> {
  return Object.fromEntries(
    Object.entries(definitions).map(([role, definition]) => [role, createProfileAgentExecutor(definition)]),
  );
}
