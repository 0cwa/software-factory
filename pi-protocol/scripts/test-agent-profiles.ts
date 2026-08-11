import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProtocolManifest } from "../packages/pi-protocol/contract/index.ts";
import {
  parsePiAgentProfiles,
  resolvePiAgentProfiles,
} from "../packages/pi-protocol/sdk/agent-profile.ts";
import { createPiSdkAgentExecutorsFromProfiles } from "../packages/pi-protocol/sdk/agent-session.ts";
import {
  createPiSdkAgentExecutor,
  disposeAllProtocolAgentSessions,
  type PiSdkAgentSessionLike,
} from "../packages/pi-protocol/sdk/index.ts";

const directory = mkdtempSync(join(tmpdir(), "pi-agent-profiles-"));
writeFileSync(join(directory, "echo.md"), "Return only the requested text.\n");
const profiles = parsePiAgentProfiles(JSON.stringify({
  schemaVersion: 1,
  agents: {
    echoer: {
      prompt: "echo.md",
      tools: ["protocol"],
      modelPolicy: { class: "balanced", thinkingLevel: "low" },
      protocolAccess: { targets: ["fixture_node.echo"], effects: ["fs.read"], maxDepth: 2, maxInvocations: 4 },
      continuation: { ttlMs: 1_000, maxSessions: 2 },
    },
  },
}));
assert(Object.isFrozen(profiles));
assert(Object.isFrozen(profiles.agents.echoer));
assert.throws(() => parsePiAgentProfiles({ schemaVersion: 1, agents: {}, surprise: true }), /unknown field/);
assert.throws(() => parsePiAgentProfiles({ schemaVersion: 1, agents: { bad: { prompt: "echo.md", protocolAccess: { targets: ["../bad"] } } } }), /Invalid protocol target/);
const resolved = resolvePiAgentProfiles(profiles, directory);
assert.match(resolved.agents.echoer.promptText, /requested text/);
const outside = mkdtempSync(join(tmpdir(), "pi-agent-outside-"));
writeFileSync(join(outside, "secret.md"), "secret");
symlinkSync(join(outside, "secret.md"), join(directory, "escape.md"));
assert.throws(() => resolvePiAgentProfiles(parsePiAgentProfiles({ schemaVersion: 1, agents: { bad: { prompt: "escape.md" } } }), directory), /contained/);

const definition = parseProtocolManifest(readFileSync(new URL("./fixtures/contracts/valid-v1.json", import.meta.url), "utf8"));
let profilePrompts = 0;
const profileExecutors = createPiSdkAgentExecutorsFromProfiles(definition, resolved, {
  agentByProvide: { echo: "echoer" },
  createSessionForAgent: () => () => fakeSession(async () => { profilePrompts += 1; }),
});
await profileExecutors.echo({ text: "hello" });
assert.equal(profilePrompts, 1);
assert.throws(() => createPiSdkAgentExecutorsFromProfiles(definition, resolved, { agentByProvide: { missing: "echoer" } }), /undeclared provide/);

let creates = 0;
let firstRelease!: () => void;
const firstGate = new Promise<void>((resolve) => { firstRelease = resolve; });
const prompts: string[] = [];
const serialized = createPiSdkAgentExecutor({
  sessionCache: { ttlMs: 10_000, maxSessions: 4 },
  createSession: () => {
    creates += 1;
    return fakeSession(async (prompt) => {
      prompts.push(prompt);
      if (prompt === "first") await firstGate;
    });
  },
});
const base = {
  nodeId: "fixture_node",
  provide: "echo",
  principal: { id: "principal:one", kind: "agent" as const },
  contractDigest: "sha256:generation-one",
  session: { id: "thread:one", mode: "continue" as const },
};
const first = serialized("first", base);
await new Promise((resolve) => setTimeout(resolve, 10));
const second = serialized("second", base);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(creates, 1);
assert.deepEqual(prompts, ["first"]);
firstRelease();
await Promise.all([first, second]);
assert.deepEqual(prompts, ["first", "second"]);

let disposed = 0;
let collisionCreates = 0;
const collisionSafe = createPiSdkAgentExecutor({
  sessionCache: { ttlMs: 10_000, maxSessions: 2 },
  createSession: () => { collisionCreates += 1; return fakeSession(async () => undefined, () => { disposed += 1; }); },
});
await collisionSafe("one", { ...base, principal: { ...base.principal, id: "a:b" }, session: { id: "c", mode: "continue" } });
await collisionSafe("two", { ...base, principal: { ...base.principal, id: "a" }, session: { id: "b:c", mode: "continue" } });
assert.equal(collisionCreates, 2, "structured identities must not collide");
await collisionSafe("replacement", { ...base, principal: { ...base.principal, id: "a:b" }, contractDigest: "sha256:generation-two", session: { id: "c", mode: "continue" } });
assert.equal(collisionCreates, 3);
assert.equal(disposed, 1, "contract replacement must dispose the stale session");
await collisionSafe("third", { ...base, session: { id: "third", mode: "continue" } });
assert(disposed >= 2, "bounded cache must evict and dispose its LRU session");

disposeAllProtocolAgentSessions();
assert(disposed >= 4, "shutdown must dispose retained sessions");
console.log("private agent profiles and bounded serialized continuation sessions work");

function fakeSession(prompt: (value: string) => Promise<void>, dispose = () => undefined): PiSdkAgentSessionLike {
  return {
    prompt,
    subscribe: () => () => undefined,
    dispose,
  };
}
