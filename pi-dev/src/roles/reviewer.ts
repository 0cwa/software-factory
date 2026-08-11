import type { ReviewerOutput, ReviewerRequest } from "../types.ts";
import type { AgentDefinition } from "../runtime/definition.ts";

export const reviewerDefinition: AgentDefinition<ReviewerRequest, ReviewerOutput> = {
  role: "reviewer",
  buildTaskDetails: (request) => ({
    suppliedDiff: request.diff,
    commit: request.commit,
    range: request.range,
    acceptanceCriteria: request.acceptanceCriteria ?? [],
    testExpectations: request.testExpectations ?? [],
  }),
};
