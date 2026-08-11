import type { ArchitectOutput, ArchitectRequest } from "../types.ts";
import type { AgentDefinition } from "../runtime/definition.ts";

export const architectDefinition: AgentDefinition<ArchitectRequest, ArchitectOutput> = {
  role: "architect",
  buildTaskDetails: (request) => ({
    constraints: request.constraints ?? [],
  }),
};
