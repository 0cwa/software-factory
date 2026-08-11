import assert from "node:assert/strict";
import { createProtocolFabric, type CanonicalProvenanceEventV1, type ProvenanceEventV1 } from "../packages/pi-protocol/index.ts";
import { parseProtocolManifest } from "../packages/pi-protocol/contract/index.ts";

const authority = {};
const deniedAuthority = {};
const events: CanonicalProvenanceEventV1[] = [];
const fabric = createProtocolFabric({
  audit: {
    maxEvents: 64,
    maxReceipts: 64,
    authorizeReceipt: (candidate) => candidate === authority,
  },
});
fabric.subscribeAudit((event) => { events.push(event); });
let slowRelease!: () => void;
const slowGate = new Promise<void>((resolve) => { slowRelease = resolve; });
const registration = fabric.install(definition(), {
  handlers: {
    echo: async (input) => ({ text: (input as { text: string }).text }),
    child: async () => ({ text: "child" }),
    parent: async () => {
      const child = await fabric.invokeTracked({ nodeId: "audit_node", provide: "child", input: {} });
      return { text: child.ok ? String((child.output as { text: string }).text) : "failed" };
    },
    slow: async () => { await slowGate; return { text: "eventual" }; },
  },
});

const secret = "SECRET_PAYLOAD_MUST_NOT_ENTER_CANONICAL_AUDIT";
const success = await fabric.invokeTracked({ nodeId: "audit_node", provide: "echo", input: { text: secret } });
assert.equal(success.ok, true);
assert.equal(success.receipt.state, "succeeded");
assert.equal(success.receipt.generation, 1);
assert.equal(success.receipt.contractDigest, registration.contractDigest);
assert.ok(Object.isFrozen(success.receipt));
assert.deepEqual(success.receipt, JSON.parse(JSON.stringify(success.receipt)), "receipts must be strict JSON without undefined fields");
assert.equal(fabric.getReceipt(success.receipt.invocationId, deniedAuthority), undefined);
assert.equal(fabric.getReceipt("invocation_unknown", authority), undefined);
assert.deepEqual(fabric.getReceipt(success.receipt.invocationId, authority), success.receipt);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(events.some((event) => event.type === "registration.installed"));
assert.ok(events.some((event) => event.type === "invocation.requested"));
assert.ok(events.some((event) => event.type === "invocation.succeeded"));
assert.ok(events.every((event) => event.schemaVersion === 1 && Object.isFrozen(event)));
assert.ok(!JSON.stringify(events).includes(secret), "canonical provenance omits payload content");

const parent = await fabric.invokeTracked({ nodeId: "audit_node", provide: "parent", input: {} });
assert.equal(parent.ok, true);
const causal = fabric.lookupCausalProvenance(parent.receipt.invocationId, authority);
assert.equal(causal?.receipts.length, 2);
assert.equal(causal?.receipts[1]?.parentInvocationId, parent.receipt.invocationId);
assert.ok(Object.isFrozen(causal));
assert.equal(fabric.lookupCausalProvenance(parent.receipt.invocationId, deniedAuthority), undefined);

const preCancelled = new AbortController();
preCancelled.abort();
const cancelledBeforeStart = await fabric.invokeTracked({ nodeId: "audit_node", provide: "echo", input: { text: "no" }, abortSignal: preCancelled.signal });
assert.equal(cancelledBeforeStart.receipt.state, "rejected");
assert.equal(cancelledBeforeStart.receipt.effectsMayHaveOccurred, false);

const abort = new AbortController();
const unknownPromise = fabric.invokeTracked({ nodeId: "audit_node", provide: "slow", input: {}, abortSignal: abort.signal });
await new Promise((resolve) => setTimeout(resolve, 0));
abort.abort();
const unknown = await unknownPromise;
assert.equal(unknown.ok, false);
assert.equal(unknown.error.code, "OUTCOME_UNKNOWN");
assert.equal(unknown.receipt.state, "outcome_unknown");
assert.equal(unknown.receipt.effectsMayHaveOccurred, true);
assert.equal(fabric.getReceipt(unknown.receipt.invocationId, authority)?.state, "outcome_unknown");
slowRelease();
await waitFor(() => events.some((event) => "invocationId" in event && event.invocationId === unknown.receipt.invocationId && event.type === "invocation.succeeded"));
assert.equal(fabric.getReceipt(unknown.receipt.invocationId, authority)?.outcomeCode, "OK");
assert.ok(fabric.auditDiagnostics().outcomeUnknown >= 1);

let requiredCalls = 0;
const requiredFabric = createProtocolFabric({
  audit: {
    mode: "required",
    timeoutMs: 10,
    sink: { append: async () => { throw new Error("sink down"); } },
    authorizeReceipt: (candidate) => candidate === authority,
  },
});
requiredFabric.install(singleDefinition("required_node"), { handlers: { run: async () => { requiredCalls += 1; return null; } } });
const unavailable = await requiredFabric.invokeTracked({ nodeId: "required_node", provide: "run", input: null });
assert.equal(unavailable.ok, false);
assert.equal(unavailable.error.code, "AUDIT_UNAVAILABLE");
assert.equal(requiredCalls, 0, "required audit failure closes before effect execution");
assert.equal(unavailable.receipt.effectsMayHaveOccurred, false);

let terminalAppends = 0;
const terminalFabric = createProtocolFabric({
  audit: {
    mode: "required",
    sink: { append: () => { terminalAppends += 1; if (terminalAppends > 1) throw new Error("terminal failure"); } },
  },
});
terminalFabric.install(singleDefinition("terminal_node"), { handlers: { run: async () => null } });
const actualSuccess = await terminalFabric.invokeTracked({ nodeId: "terminal_node", provide: "run", input: null });
assert.equal(actualSuccess.ok, true, "post-effect audit failure cannot falsify actual success");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(terminalFabric.auditDiagnostics().sinkFailures >= 1);

let acceptRequired!: () => void;
const requiredGate = new Promise<void>((resolve) => { acceptRequired = resolve; });
let requiredStartSeen!: () => void;
const requiredStarted = new Promise<void>((resolve) => { requiredStartSeen = resolve; });
const pinnedEvents: CanonicalProvenanceEventV1[] = [];
const pinnedFabric = createProtocolFabric({
  audit: {
    mode: "required",
    sink: { append: async (event) => { if (event.type === "invocation.started") { requiredStartSeen(); await requiredGate; } } },
  },
});
pinnedFabric.subscribeAudit((event) => { pinnedEvents.push(event); });
let oldRan = 0;
let newRan = 0;
const pinnedRegistration = pinnedFabric.install(singleDefinition("pinned_audit_node", "old"), { handlers: { run: async () => { oldRan += 1; return null; } } });
const pinnedCall = pinnedFabric.invokeTracked({ nodeId: "pinned_audit_node", provide: "run", input: null });
await requiredStarted;
const pinnedReplacement = pinnedRegistration.replace(singleDefinition("pinned_audit_node", "new"), { handlers: { run: async () => { newRan += 1; return null; } } });
assert.equal(pinnedRegistration.generation, 2);
acceptRequired();
const pinnedResult = await pinnedCall;
assert.equal(pinnedResult.ok, true);
assert.equal(pinnedResult.receipt.generation, 1);
assert.equal(oldRan, 1);
assert.equal(newRan, 0);
await pinnedReplacement;
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(pinnedEvents.filter((event): event is ProvenanceEventV1 => "invocationId" in event && event.invocationId === pinnedResult.receipt.invocationId).every((event) => event.generation === undefined || event.generation === 1));
await pinnedRegistration.dispose();

let abortAuditRelease!: () => void;
const abortAuditGate = new Promise<void>((resolve) => { abortAuditRelease = resolve; });
let abortBindingCalls = 0;
const abortAuditFabric = createProtocolFabric({ audit: { mode: "required", sink: { append: () => abortAuditGate } } });
abortAuditFabric.install(singleDefinition("abort_audit_node"), { handlers: { run: async () => { abortBindingCalls += 1; return null; } } });
const auditAbort = new AbortController();
const abortDuringAudit = abortAuditFabric.invokeTracked({ nodeId: "abort_audit_node", provide: "run", input: null, abortSignal: auditAbort.signal });
auditAbort.abort();
abortAuditRelease();
const auditAborted = await abortDuringAudit;
assert.equal(auditAborted.receipt.state, "rejected");
assert.equal(auditAborted.receipt.effectsMayHaveOccurred, false);
assert.equal(abortBindingCalls, 0);

const correlationSecret = "CORRELATION_SECRET_" + "x".repeat(10_000);
await fabric.invokeTracked({ nodeId: "audit_node", provide: "echo", input: { text: "safe" }, traceId: correlationSecret, spanId: correlationSecret });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(!JSON.stringify(events).includes("CORRELATION_SECRET"), "caller correlation identifiers are not canonical IDs");
const accessorRequest: Record<string, unknown> = { nodeId: "audit_node", provide: "echo", input: { text: "safe" } };
Object.defineProperty(accessorRequest, "traceId", { enumerable: true, get: () => { throw new Error("getter must not run"); } });
const accessorRejected = await fabric.invokeTracked(accessorRequest as any);
assert.equal(accessorRejected.ok, false);
assert.equal(accessorRejected.error.code, "INPUT_INVALID");
assert.equal(accessorRejected.receipt.state, "rejected");

const bestEffortFabric = createProtocolFabric({
  audit: { mode: "best_effort", sink: { append: () => new Promise<void>(() => undefined) }, maxEvents: 64 },
});
bestEffortFabric.install(singleDefinition("best_effort_node"), { handlers: { run: async () => null } });
const startedAt = Date.now();
assert.equal((await bestEffortFabric.invokeTracked({ nodeId: "best_effort_node", provide: "run", input: null })).ok, true);
assert.ok(Date.now() - startedAt < 100, "best-effort sink never blocks execution");
const observerFabric = createProtocolFabric({ audit: { maxEvents: 512 } });
observerFabric.subscribeAudit(() => new Promise<void>(() => undefined));
observerFabric.install(singleDefinition("observer_node"), { handlers: { run: async () => null } });
for (let index = 0; index < 70; index += 1) await observerFabric.invokeTracked({ nodeId: "observer_node", provide: "run", input: null });
assert.ok(observerFabric.auditDiagnostics().observerDropped > 0, "hanging observer queue is bounded");

for (let index = 0; index < 40; index += 1) {
  await fabric.invokeTracked({ nodeId: "audit_node", provide: "echo", input: { text: String(index) } });
}
assert.ok(fabric.auditDiagnostics().eventCount <= 64);
assert.ok(fabric.auditDiagnostics().evictedEvents > 0);

let burstRelease!: () => void;
const burstGate = new Promise<void>((resolve) => { burstRelease = resolve; });
const burstFabric = createProtocolFabric({ audit: { maxReceipts: 64 } });
burstFabric.install(singleDefinition("burst_node"), { handlers: { run: async () => { await burstGate; return null; } } });
const burst = Array.from({ length: 70 }, () => burstFabric.invokeTracked({ nodeId: "burst_node", provide: "run", input: null }));
await new Promise((resolve) => setTimeout(resolve, 0));
burstRelease();
await Promise.all(burst);
assert.ok(burstFabric.auditDiagnostics().receiptCount <= 64, "terminal settlement prunes concurrent receipt bursts");

await registration.dispose();
console.log("canonical causal provenance, receipts, sink modes, privacy, and cancellation truth work");

function definition() {
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: { id: "audit_node", purpose: "Audit fixture." },
    provides: [
      provide("echo", { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string", "x-pi-sensitive": true } } }, objectText()),
      provide("child", { type: "object", additionalProperties: false }, objectText()),
      provide("parent", { type: "object", additionalProperties: false }, objectText()),
      provide("slow", { type: "object", additionalProperties: false }, objectText()),
    ],
  });
}

function singleDefinition(nodeId: string, description = "Run.") {
  return parseProtocolManifest({
    $schema: "https://pi.dev/protocol/manifest-v1.schema.json",
    schemaVersion: 1,
    node: { id: nodeId, purpose: "Single audit fixture." },
    provides: [{ name: "run", description, inputSchema: { type: "null" }, outputSchema: { type: "null" } }],
  });
}

function provide(name: string, inputSchema: any, outputSchema: any, effects?: string[]) {
  return { name, description: `${name}.`, inputSchema, outputSchema, ...(effects ? { effects } : {}) };
}
function objectText() {
  return { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };
}
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("eventual receipt did not settle");
}
