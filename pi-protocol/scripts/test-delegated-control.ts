import assert from "node:assert/strict";
import { createProtocolFabric, type ConfirmationRequest, type ProtocolInvocationContext } from "../packages/pi-protocol/index.ts";
import { InvocationLimiter } from "../packages/pi-protocol/invocation-limiter.ts";
import { parseProtocolManifest } from "../packages/pi-protocol/contract/index.ts";
import { getInvocationControl } from "../packages/pi-protocol/control.ts";
import {
  runWithPiSdkProtocolControlContext,
  type PiSdkProtocolControlContext,
} from "../packages/pi-protocol/sdk/index.ts";

const fabric = createProtocolFabric();
const principal = fabric.mintPrincipal("agent:test", "agent");
let seenPrincipal = "";
let seenDeadline: number | undefined;
let progressSeen = false;
let bridgedControl: PiSdkProtocolControlContext | undefined;
fabric.subscribeProgress({ emit: () => { progressSeen = true; } });
fabric.install(definition("control_node"), {
  handlers: {
    identity: async (_input, context) => {
      seenPrincipal = context?.principal?.id ?? "missing";
      seenDeadline = context?.deadline;
      return { principal: seenPrincipal, remaining: context?.remainingBudget?.remainingInvocations };
    },
    child: async () => ({ value: "child" }),
    secret: async () => ({ value: "secret" }),
    parent_allowed: async (_input, context) => ({ child: await context!.invoke!("control_node.child", {}) }),
    parent_forbidden: async (_input, context) => ({ child: await context!.invoke!("control_node.secret", {}, { grant: { targets: ["*"] } }) }),
    fanout: async (_input, context) => ({
      first: await context!.invoke!("control_node.child", {}),
      second: await context!.invoke!("control_node.child", {}),
    }),
    discover: async () => ({ targets: fabric.registry().provides.map((provide) => provide.globalId) }),
    bridge: async () => { bridgedControl = getInvocationControl(); return null; },
    progress: async (_input, context) => { context!.progress!({ message: "working", completed: 1, total: 1 }); return null; },
    external: async () => ({ charged: true }),
    gate: async () => null,
  },
});

const identity = await fabric.invokeAs(principal, "control_node.identity", {}, {
  grant: { targets: ["control_node.identity"], maxDepth: 2, maxInvocations: 4 },
});
assert.equal(identity.ok, true);
assert.equal(seenPrincipal, "agent:test");
assert.equal(seenDeadline, Number.POSITIVE_INFINITY, "protocol invocations have no implicit deadline");
assert.ok(Object.isFrozen(identity.receipt));

const forbidden = await fabric.invokeAs(principal, "control_node.secret", {}, {
  grant: { targets: ["control_node.child"] },
});
assert.equal(forbidden.ok, false);
assert.equal(forbidden.error.code, "FORBIDDEN");

const allowedChild = await fabric.invokeAs(principal, "control_node.parent_allowed", {}, {
  grant: { targets: ["control_node.parent_allowed", "control_node.child"], maxDepth: 2, maxInvocations: 3 },
});
assert.equal(allowedChild.ok, true);
const deniedChild = await fabric.invokeAs(principal, "control_node.parent_forbidden", {}, {
  grant: { targets: ["control_node.parent_forbidden"], maxDepth: 2, maxInvocations: 3 },
});
assert.equal(deniedChild.ok, true);
assert.equal((deniedChild.output as any).child.error.code, "FORBIDDEN", "child grant cannot broaden parent authority");

const exhausted = await fabric.invokeAs(principal, "control_node.fanout", {}, {
  grant: { targets: ["control_node.fanout", "control_node.child"], maxDepth: 2, maxInvocations: 2 },
});
assert.equal(exhausted.ok, true);
assert.equal((exhausted.output as any).first.ok, true);
assert.equal((exhausted.output as any).second.error.code, "OVERLOADED");

const depthBound = await fabric.invokeAs(principal, "control_node.parent_allowed", {}, {
  grant: { targets: ["control_node.parent_allowed", "control_node.child"], maxDepth: 0, maxInvocations: 3 },
});
assert.equal(depthBound.ok, true);
assert.equal((depthBound.output as any).child.error.code, "OVERLOADED");

const discovery = await fabric.invokeAs(principal, "control_node.discover", {}, {
  grant: { targets: ["control_node.discover", "control_node.child", "control_node.external"], effects: ["fs.read"] },
});
assert.ok(discovery.ok);
assert.deepEqual((discovery.output as any).targets, ["control_node.child", "control_node.discover"]);

await fabric.invokeAs(principal, "control_node.bridge", {}, {
  grant: { targets: ["control_node.bridge", "control_node.child"] },
});
assert.ok(bridgedControl);
const bridgedTargets = runWithPiSdkProtocolControlContext(bridgedControl, () =>
  fabric.registry().provides.map((provide) => provide.globalId));
assert.deepEqual(bridgedTargets, ["control_node.child", "control_node.bridge"]);

await fabric.invokeAs(principal, "control_node.progress", {}, { grant: { targets: ["control_node.progress"] } });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(progressSeen, true);

const expired = await fabric.invokeAs(principal, "control_node.identity", {}, {
  grant: { targets: ["control_node.identity"] },
  deadline: Date.now() - 1,
});
assert.equal(expired.ok, false);
assert.equal(errorCode(expired), "DEADLINE_EXCEEDED");

const forged = await fabric.invokeAs({ id: "forged", kind: "agent" } as any, "control_node.identity", {}, {
  grant: { targets: ["*"] },
});
assert.equal(forged.ok, false);
assert.equal(errorCode(forged), "INVALID_TARGET");
const forgedMarked: Record<PropertyKey, unknown> = { id: "forged-marked", kind: "agent" };
Object.defineProperty(forgedMarked, Symbol.for("@kybernetria/pi-protocol.principal.v1"), { value: true });
Object.freeze(forgedMarked);
assert.equal(errorCode(await fabric.invokeAs(forgedMarked as any, "control_node.identity", {}, { grant: { targets: ["*"] } })), "INVALID_TARGET");
assert.throws(() => createProtocolFabric({ maxQueuedInvocations: Number.NaN }), /maxQueuedInvocations/);
assert.throws(() => createProtocolFabric({ maxConcurrentInvocations: 1.5 }), /maxConcurrentInvocations/);

let confirmed = 0;
let confirmationRequest: ConfirmationRequest | undefined;
const confirmedFabric = createProtocolFabric({
  confirmationBroker: {
    confirm: (request) => { confirmed += 1; confirmationRequest = request; return true; },
  },
});
const confirmedPrincipal = confirmedFabric.mintPrincipal("user:confirmed", "user");
confirmedFabric.install(externalDefinition("confirmed_node"), { handlers: { charge: async () => ({ charged: true }) } });
const charged = await confirmedFabric.invokeAs(confirmedPrincipal, "confirmed_node.charge", { amount: 1 }, {
  grant: { targets: ["confirmed_node.charge"], effects: ["external.transaction"] },
});
assert.equal(charged.ok, true);
assert.equal(confirmed, 1);
assert.equal(confirmationRequest?.principal, confirmedPrincipal);
assert.equal(confirmationRequest?.target, "confirmed_node.charge");
assert.match(confirmationRequest?.inputDigest ?? "", /^sha256:/);

let mutationApproval!: () => void;
const mutationGate = new Promise<void>((resolve) => { mutationApproval = resolve; });
let mutationBrokerSeen!: () => void;
const mutationSeen = new Promise<void>((resolve) => { mutationBrokerSeen = resolve; });
let executedAmount = 0;
const mutationFabric = createProtocolFabric({ confirmationBroker: { confirm: async () => { mutationBrokerSeen(); await mutationGate; return true; } } });
const mutationPrincipal = mutationFabric.mintPrincipal("user:mutation", "user");
mutationFabric.install(externalDefinition("mutation_node"), { handlers: { charge: async (input) => { executedAmount = (input as any).amount; return { charged: true }; } } });
const mutableInput = { amount: 1 };
const mutationCall = mutationFabric.invokeAs(mutationPrincipal, "mutation_node.charge", mutableInput, { grant: { targets: ["mutation_node.charge"], effects: ["external.transaction"] } });
await mutationSeen;
mutableInput.amount = 999;
mutationApproval();
assert.equal((await mutationCall).ok, true);
assert.equal(executedAmount, 1, "confirmation digest and execution use the same immutable snapshot");

let deniedExecutions = 0;
const deniedFabric = createProtocolFabric({ confirmationBroker: { confirm: () => false } });
const deniedPrincipal = deniedFabric.mintPrincipal("user:denied", "user");
deniedFabric.install(externalDefinition("denied_node"), { handlers: { charge: async () => { deniedExecutions += 1; return { charged: true }; } } });
const denied = await deniedFabric.invokeAs(deniedPrincipal, "denied_node.charge", { amount: 1 }, {
  grant: { targets: ["denied_node.charge"], effects: ["external.transaction"] },
});
assert.equal(errorCode(denied), "CONFIRMATION_DENIED");
assert.equal(deniedExecutions, 0);

const headlessFabric = createProtocolFabric();
headlessFabric.install(externalDefinition("headless_node"), { handlers: { charge: async () => ({ charged: true }) } });
const headless = await headlessFabric.invokeAs(headlessFabric.mintPrincipal("headless", "host"), "headless_node.charge", { amount: 1 }, {
  grant: { targets: ["headless_node.charge"], effects: ["external.transaction"] },
});
assert.equal(errorCode(headless), "CONFIRMATION_REQUIRED");

let gateRelease!: () => void;
const gate = new Promise<void>((resolve) => { gateRelease = resolve; });
let gateCalls = 0;
const limitedFabric = createProtocolFabric({ maxConcurrentInvocations: 1, maxQueuedInvocations: 1, defaultDeadlineMs: 5_000 });
const limitedPrincipal = limitedFabric.mintPrincipal("limited", "agent");
limitedFabric.install(gateDefinition(), { handlers: { wait: async () => { gateCalls += 1; await gate; return null; } } });
const first = limitedFabric.invokeAs(limitedPrincipal, "limited_node.wait", {}, { grant: { targets: ["limited_node.wait"], maxInvocations: 1 } });
await waitFor(() => gateCalls === 1);
const second = limitedFabric.invokeAs(limitedPrincipal, "limited_node.wait", {}, { grant: { targets: ["limited_node.wait"], maxInvocations: 1 } });
const third = await limitedFabric.invokeAs(limitedPrincipal, "limited_node.wait", {}, { grant: { targets: ["limited_node.wait"], maxInvocations: 1 } });
assert.equal(errorCode(third), "OVERLOADED");
gateRelease();
assert.equal((await first).ok, true);
assert.equal((await second).ok, true);

const directLimiter = new InvocationLimiter(1, 1);
const heldSlot = await directLimiter.acquire(undefined, Number.POSITIVE_INFINITY);
const overdueDeadline = Date.now() + 10;
const overdueWaiter = directLimiter.acquire(undefined, overdueDeadline);
const blockUntil = Date.now() + 30;
while (Date.now() < blockUntil) { /* keep the deadline timer from running before dispatch */ }
heldSlot();
await assert.rejects(overdueWaiter, (error: any) => error.code === "DEADLINE_EXCEEDED");
assert.deepEqual(directLimiter.diagnostics(), { active: 0, queued: 0 });

const delegatedLimited = createProtocolFabric({ maxConcurrentInvocations: 1, maxQueuedInvocations: 2 });
let detachedRelease!: () => void;
const detachedGate = new Promise<void>((resolve) => { detachedRelease = resolve; });
let detachedPromise: Promise<unknown> | undefined;
const delegatedPrincipal = delegatedLimited.mintPrincipal("delegated-limited", "agent");
delegatedLimited.install(delegationDefinition(), {
  handlers: {
    child: async () => ({ ok: true }),
    parent: async (_input, context) => ({ child: await context!.invoke!("delegation_node.child", {}) }),
    scoped_parent: async (_input, context) => ({ child: await context!.invoke!("delegation_node.scoped_child", {}, { grant: { targets: ["delegation_node.scoped_child", "delegation_node.grandchild"], maxInvocations: 1 } }) }),
    scoped_child: async (_input, context) => ({ grandchild: await context!.invoke!("delegation_node.grandchild", {}) }),
    grandchild: async () => ({ ok: true }),
    detached_child: async () => { await detachedGate; return { ok: true }; },
    detached_parent: async (_input, context) => { detachedPromise = context!.invoke!("delegation_node.detached_child", {}); void detachedPromise.catch(() => undefined); return { launched: true }; },
  },
});
const oneSlotDelegation = await delegatedLimited.invokeAs(delegatedPrincipal, "delegation_node.parent", {}, { grant: { targets: ["delegation_node.parent", "delegation_node.child"], maxDepth: 2, maxInvocations: 3 } });
assert.equal(oneSlotDelegation.ok, true, "context.invoke suspends parent concurrency ownership");
assert.equal((oneSlotDelegation.output as any).child.ok, true);
const scoped = await delegatedLimited.invokeAs(delegatedPrincipal, "delegation_node.scoped_parent", {}, { grant: { targets: ["delegation_node.scoped_parent", "delegation_node.scoped_child", "delegation_node.grandchild"], maxDepth: 3, maxInvocations: 5 } });
assert.equal(scoped.ok, true);
assert.equal((scoped.output as any).child.output.grandchild.error.code, "OVERLOADED", "attenuated child invocation budget governs descendants");
const detached = await delegatedLimited.invokeAs(delegatedPrincipal, "delegation_node.detached_parent", {}, { grant: { targets: ["delegation_node.detached_parent", "delegation_node.detached_child"], maxInvocations: 3 } });
assert.equal(detached.ok, true);
detachedRelease();
await detachedPromise;
const afterDetached = await delegatedLimited.invokeAs(delegatedPrincipal, "delegation_node.child", {}, { grant: { targets: ["delegation_node.child"] } });
assert.equal(afterDetached.ok, true, "detached child completion does not leak a parent concurrency slot");

console.log("host principals, attenuated delegation, budgets, deadlines, confirmation, discovery filtering, and overload control work");

function definition(nodeId: string) {
  const names = ["identity", "child", "secret", "parent_allowed", "parent_forbidden", "fanout", "discover", "bridge", "progress", "external", "gate"];
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json", schemaVersion: 1,
    node: { id: nodeId, purpose: "Delegation control fixture." },
    provides: names.map((name) => ({
      name, description: `${name}.`, inputSchema: { type: "object" }, outputSchema: {},
      ...(name === "external" ? { effects: ["external.transaction"] } : {}),
    })),
  });
}
function externalDefinition(nodeId: string) {
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json", schemaVersion: 1,
    node: { id: nodeId, purpose: "Confirmation fixture." },
    provides: [{ name: "charge", description: "Charge.", inputSchema: { type: "object" }, outputSchema: { type: "object" }, effects: ["external.transaction"] }],
  });
}
function delegationDefinition() {
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json", schemaVersion: 1,
    node: { id: "delegation_node", purpose: "Nested limiter fixture." },
    provides: ["child", "parent", "scoped_parent", "scoped_child", "grandchild", "detached_parent", "detached_child"].map((name) => ({ name, description: `${name}.`, inputSchema: { type: "object" }, outputSchema: {} })),
  });
}
function gateDefinition() {
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json", schemaVersion: 1,
    node: { id: "limited_node", purpose: "Limiter fixture." },
    provides: [{ name: "wait", description: "Wait.", inputSchema: { type: "object" }, outputSchema: { type: "null" } }],
  });
}
function errorCode(result: Awaited<ReturnType<typeof fabric.invokeAs>>): string | undefined {
  return result.ok ? undefined : result.error.code;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("condition not reached");
}
