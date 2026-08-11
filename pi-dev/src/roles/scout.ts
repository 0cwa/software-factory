import type { ScoutOutput, ScoutRequest } from "../types.ts";
import type { AgentDefinition } from "../runtime/definition.ts";

export const scoutDefinition: AgentDefinition<ScoutRequest, ScoutOutput> = {
  role: "scout",
  buildTaskDetails: (request) => ({
    scope: request.scope ?? [],
    questions: request.questions ?? [],
  }),
};
