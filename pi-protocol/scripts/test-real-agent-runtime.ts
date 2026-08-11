import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureProtocolFabric, type ProtocolInvocationContext } from "../packages/pi-protocol/core/index.ts";
import { parseProtocolManifest } from "../packages/pi-protocol/contract/index.ts";
import { parsePiAgentProfiles, resolvePiAgentProfiles } from "../packages/pi-protocol/sdk/agent-profile.ts";
import { createPiSdkAgentExecutorsFromProfiles } from "../packages/pi-protocol/sdk/agent-session.ts";
import type { PiSdkAgentSessionEventLike, PiSdkAgentSessionLike } from "../packages/pi-protocol/sdk/index.ts";

const nodeId = "official_real_agent_runtime_test";
const objectSchema = { type: "string" } as const;
const definition = parseProtocolManifest({
  $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
  schemaVersion: 1,
  node: { id: nodeId, purpose: "Verify private Pi SDK-backed agent orchestration." },
  provides: [
    { name: "start", description: "Handler-backed orchestration.", inputSchema: objectSchema, outputSchema: objectSchema, effects: ["model.call"] },
    { name: "draft_b", description: "Agent B draft.", inputSchema: objectSchema, outputSchema: objectSchema, effects: ["model.call"] },
    { name: "ask_c", description: "Agent C review.", inputSchema: objectSchema, outputSchema: objectSchema, effects: ["model.call"] },
    { name: "synthesize_b", description: "Agent B synthesis.", inputSchema: objectSchema, outputSchema: objectSchema, effects: ["model.call"] },
  ],
});
const profileRoot = await mkdtemp(join(tmpdir(), "pi-protocol-real-agent-"));
await writeFile(join(profileRoot, "agent-b.md"), "Agent B private prompt.");
await writeFile(join(profileRoot, "agent-c.md"), "Agent C private prompt.");
const profiles = resolvePiAgentProfiles(parsePiAgentProfiles({
  schemaVersion: 1,
  agents: {
    agent_b: { prompt: "agent-b.md", tools: [], continuation: { ttlMs: 30_000, maxSessions: 4 } },
    agent_c: { prompt: "agent-c.md", tools: [], continuation: { ttlMs: 30_000, maxSessions: 4 } },
  },
}), profileRoot);
const prompts: Array<{ agentName: string; prompt: string }> = [];

class FakePiAgentSession implements PiSdkAgentSessionLike {
  private listener: ((event: PiSdkAgentSessionEventLike) => void) | undefined;
  constructor(private readonly agentName: string) {}
  async prompt(prompt: string): Promise<void> {
    prompts.push({ agentName: this.agentName, prompt });
    this.listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: `[${this.agentName}:${prompt}]` } });
  }
  subscribe(listener: (event: PiSdkAgentSessionEventLike) => void): () => void {
    this.listener = listener;
    return () => { this.listener = undefined; };
  }
  dispose(): void {}
}

const fabric = ensureProtocolFabric();
const agentExecutors = createPiSdkAgentExecutorsFromProfiles(definition, profiles, {
  agentByProvide: { draft_b: "agent_b", ask_c: "agent_c", synthesize_b: "agent_b" },
  createSessionForAgent: (agentName) => () => new FakePiAgentSession(agentName),
  toPromptByAgent: () => (input: unknown) => String(input),
  toOutputByAgent: () => (text: string) => text,
});
const registration = fabric.install(definition, {
  handlers: { start: async (input, context) => runChain(String(input), context) },
  agents: agentExecutors,
});

assert.equal("agents" in (fabric.describeNode(nodeId) ?? {}), false, "private profiles must not enter discovery");
assert.equal(fabric.describeProvide(nodeId, "draft_b")?.execution.type, "agent");
const principal = fabric.mintPrincipal("real-agent-test", "host");
const grant = { targets: [`${nodeId}.*`], effects: ["model.call"], budgets: { maxCalls: 8, maxDepth: 4 } } as const;
const direct = await fabric.invokeAs(principal, `${nodeId}.draft_b`, "direct", { grant });
assert.equal(direct.ok && direct.output, "[agent_b:direct]");
const nested = await fabric.invokeAs(principal, `${nodeId}.start`, "task", { grant });
assert.equal(nested.ok && nested.output, "[agent_b:synthesize task with [agent_b:draft task] and [agent_c:review [agent_b:draft task]]]");
assert.deepEqual(prompts.map((item) => item.agentName), ["agent_b", "agent_b", "agent_c", "agent_b"]);

await registration.dispose();
await rm(profileRoot, { recursive: true, force: true });
console.log("private Pi SDK agent profiles and canonical orchestration work");

async function runChain(task: string, context: ProtocolInvocationContext | undefined): Promise<string> {
  assert(context?.invoke, "handler context must expose bounded delegation");
  const call = async (provide: string, input: string) => {
    const result = await context.invoke!(`${nodeId}.${provide}`, input);
    assert(result.ok, result.ok ? undefined : result.error.message);
    return String(result.output);
  };
  const draft = await call("draft_b", `draft ${task}`);
  const review = await call("ask_c", `review ${draft}`);
  return call("synthesize_b", `synthesize ${task} with ${draft} and ${review}`);
}
