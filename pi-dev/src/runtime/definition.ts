import type { AgentRequestBase } from "../types.ts";

export type AgentRole = "scout" | "architect" | "worker" | "reviewer" | "security_reviewer";

/** Role-specific prompt shaping only; operational configuration lives in pi.protocol.json. */
export interface AgentDefinition<Request extends AgentRequestBase, Output> {
  role: AgentRole;
  buildTaskDetails(request: Request): Record<string, unknown>;
  /** Retains the output type at compile time without duplicating the manifest schema. */
  readonly __outputType?: Output;
}
