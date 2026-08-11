import type { WorkerOutput, WorkerRequest } from "../types.ts";
import type { AgentDefinition } from "../runtime/definition.ts";

export const workerDefinition: AgentDefinition<WorkerRequest, WorkerOutput> = {
  role: "worker",
  buildTaskDetails: (request) => ({
    plan: request.plan ?? [],
    acceptanceCriteria: request.acceptanceCriteria ?? [],
  }),
};
