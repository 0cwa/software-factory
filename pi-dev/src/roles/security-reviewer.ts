import type { SecurityReviewerOutput, SecurityReviewerRequest } from "../types.ts";
import type { AgentDefinition } from "../runtime/definition.ts";

export const securityReviewerDefinition: AgentDefinition<SecurityReviewerRequest, SecurityReviewerOutput> = {
  role: "security_reviewer",
  buildTaskDetails: (request) => ({
    suppliedDiff: request.diff,
    commit: request.commit,
    range: request.range,
    acceptanceCriteria: request.acceptanceCriteria ?? [],
    testExpectations: request.testExpectations ?? [],
    securityFocus: request.securityFocus ?? [],
  }),
};
