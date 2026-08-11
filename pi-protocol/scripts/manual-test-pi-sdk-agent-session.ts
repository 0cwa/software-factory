import { invokeResult } from "./helpers/invoke-test.ts";
import { installTestNode, disposeTestNode } from "./helpers/install-test-node.ts";
import { ensureProtocolFabric, type JsonSchemaLite } from "../packages/pi-protocol/index.ts";
import { createDefaultPiSdkAgentExecutor } from "../packages/pi-protocol/sdk/agent-session.ts";

// Manual/live test. Requires existing Pi SDK auth/model configuration and may use tokens.
// Run explicitly with:
//
//   npx tsx scripts/manual-test-pi-sdk-agent-session.ts
//
// This is intentionally not part of the deterministic test set.

const inputSchema: JsonSchemaLite = {
  type: "object",
  required: ["goal"],
  properties: { goal: { type: "string" } },
};

const outputSchema: JsonSchemaLite = {
  type: "object",
  required: ["text"],
  properties: { text: { type: "string" } },
};

const fabric = ensureProtocolFabric();

installTestNode(fabric, {
  node: {
    nodeId: "live_sdk_agent",
    purpose: "Manual live test node for Pi SDK agent session execution.",
    provides: [
      {
        name: "plan",
        description: "Create a short plan using a real Pi SDK AgentSession.",
        inputSchema,
        outputSchema,
        execution: { type: "agent", agent: "planner" },
      },
    ],
  },
  agentExecutors: {
    planner: createDefaultPiSdkAgentExecutor({
      toPrompt: (input) =>
        `Create a concise 3-step plan for this protocol goal. Return only the plan.\n\nInput:\n${JSON.stringify(input, null, 2)}`,
      toOutput: (text) => ({ text }),
      sessionOptions: {
        cwd: process.cwd(),
        tools: ["read", "bash"],
      },
    }),
  },
});

const result = await invokeResult(fabric, {
  nodeId: "live_sdk_agent",
  provide: "plan",
  input: { goal: "verify protocol agent execution through a real Pi SDK AgentSession" },
});

console.dir(result, { depth: null });
