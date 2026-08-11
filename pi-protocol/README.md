# Pi Protocol

Pi Protocol is a self-describing, provenance-preserving capability kernel through which autonomous agents discover, compose, delegate, observe, and replan across extension-provided capabilities without central knowledge of installed extensions.

The unit of composition is the **provide**, identified only as:

```text
nodeId.provideName
```

A caller reasons about a provide's contract and behavior, not whether code, an agent, a pipeline, another fabric, or a future transport implements it.

```text
discover → select → invoke → observe → replan
                         └── delegate to more provides
```

The kernel is not a workflow engine and same-process extension policy is not a sandbox.

## Authority model

```text
Manifest     = what was promised
Registration = what was installed
Provenance   = what actually happened
```

- `package.json`: package ID/version, entrypoints, dependencies
- `pi.protocol.json`: public capability contracts only
- optional `pi.agents.json`: private Pi prompts, model policy, tools, grants, continuation policy
- runtime registration: implementation, owner, generation, source/build identity, health
- provenance ledger: requests, delegation, approvals, actual outcomes

Resolved prompts never enter the public registry.

## Canonical manifest v1

`packages/pi-protocol/contract/manifest.schema.json` is the authoritative wire schema.

```json
{
  "$schema": "https://pi.dev/protocol/manifest-v1.schema.json",
  "schemaVersion": 1,
  "node": {
    "id": "pi_ng",
    "purpose": "Transport-neutral notification capabilities.",
    "tags": ["notifications"]
  },
  "$defs": {},
  "provides": [
    {
      "name": "notify",
      "description": "Queue a notification through configured transports.",
      "inputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["message"],
        "properties": {
          "message": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100000,
            "x-pi-sensitive": true
          }
        }
      },
      "outputSchema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["accepted", "deliveryId"],
        "properties": {
          "accepted": { "const": true },
          "deliveryId": { "type": "string", "minLength": 1 }
        }
      },
      "effects": ["network.send"],
      "traits": {
        "determinism": "best_effort",
        "replay": "unsafe",
        "interaction": "request_response",
        "cancellable": true
      }
    }
  ]
}
```

Standard effects are:

```text
fs.read  fs.write  db.read  db.write  network.read  network.send
process.spawn  model.call  protocol.invoke  external.transaction
system.configure
```

The bounded JSON Schema 2020-12 profile supports acyclic local definitions/references, strict objects and arrays, nullable unions, bounded `oneOf`, ranges, a linear-time pattern subset, descriptions/examples, content annotations, and restrictive sensitivity annotations. Remote or cyclic references, backtracking-prone regex constructs, coercion, default mutation, executable transformations, unknown keywords, and unbounded schema structures are rejected.

Protocol payloads are strict JSON values. Functions, symbols, BigInt, non-finite numbers, cyclic graphs, accessors, Proxy objects, and arbitrary class instances fail at the boundary.

## Contract admission

```ts
import { parseProtocolManifest } from "@kybernetria/pi-protocol/contract";

const definition = parseProtocolManifest(source);

console.log(definition.manifest.node.id);
console.log(definition.contractDigest);
console.log(definition.provides.notify.validateInput({ message: "Done" }));
```

Admission is bounded, non-mutating, and side-effect free. It validates the manifest, enforces schema budgets, compiles each input/output validator once, normalizes and freezes the contract, and computes a stable `sha256:` digest.

Returned failures use `ProtocolContractError` with stable codes:

```text
INVALID_JSON  INVALID_JSON_VALUE  BUDGET_EXCEEDED
UNSUPPORTED_VERSION  MANIFEST_INVALID  SCHEMA_INVALID
```

Validation issues are bounded and do not include manifest values. Pi Protocol v4 admits schema-version-1 contracts only; previous manifest formats must be migrated before runtime admission.

## Package boundaries

- `@kybernetria/pi-protocol` — contracts and local fabric
- `@kybernetria/pi-protocol/contract` — canonical admission, validators, limits, normalization, digest
- `@kybernetria/pi-protocol/core` — Pi-independent local fabric only
- `@kybernetria/pi-protocol/pi` — canonical Pi tool projection
- `@kybernetria/pi-protocol/pi/agents` — canonical Pi agent adapter, private profiles, and sessions

The core import graph does not load Ajv, Pi coding-agent/model/TUI APIs, tools, rendering, agent sessions, or filesystem manifest resolution. The package root does not eagerly load Pi APIs. Pi Protocol v4 exposes no alternate tool, SDK, or agent-session entrypoint aliases.

## Owned atomic registrations

Canonical definitions install with exact provide-name bindings and return an ownership lease:

```ts
const registration = fabric.install(definition, {
  handlers: { notify: notifyHandler },
  agents: {}
}, {
  packageId: "@example/notifications",
  packageVersion: "1.0.0"
});

await registration.replace(nextDefinition, nextBindings);
await registration.dispose();
```

Every provide has exactly one handler or agent binding; missing, duplicate, inherited, or extra bindings fail before publication. Replacement retains the registration ID, increments its generation, and publishes atomically. Existing calls remain pinned to the old implementation, validators, and digest while it drains; old resources dispose only after those calls finish. Only the lease can replace or remove an owned registration.

Compatible physical package copies connect through a structural global host ABI. Incompatible live hosts/fabrics fail loudly rather than being replaced. Runtime diagnostics report package versions and module paths.

## Canonical causal provenance

Use `invokeTracked()` when the caller needs a trustworthy receipt:

```ts
const tracked = await fabric.invokeTracked({
  nodeId: "pi_ng",
  provide: "notify",
  input: { message: "Done" },
  abortSignal
});

console.log(tracked.receipt.invocationId, tracked.receipt.state);
```

Canonical events omit payload content by default and record bounded sizes, stable outcomes, causal parent/children, and the pinned registration generation/digest. Authorized hosts can query one receipt or a bounded causal subtree; lookup is default-deny.

Best-effort audit sinks are bounded and never block execution. Required sinks must accept the start event before a binding runs or the call fails closed with `AUDIT_UNAVAILABLE`. Cancellation after dispatch may return `OUTCOME_UNKNOWN`; the same receipt later records the actual outcome instead of falsely claiming cancellation.

## Bounded delegated invocation

Hosts mint principals and invoke with allow-only grants:

```ts
const principal = fabric.mintPrincipal("agent:planner", "agent");
const result = await fabric.invokeAs(principal, "pi_dev.scout", input, {
  grant: {
    targets: ["pi_dev.scout", "pi_todo.*"],
    effects: ["fs.read", "protocol.invoke"],
    maxDepth: 4,
    maxInvocations: 16
  },
  deadline: Date.now() + 30_000,
  signal
});
```

Handlers receive `context.invoke()`, the principal, linked cancellation, an absolute deadline, remaining depth/call budget, and non-blocking progress. Child authority, effects, time, and budget can only decrease. Discovery is filtered by the same grant. Global execution and waiting queues are bounded.

Confirmation-required effects are approved only through the host confirmation broker, bound to principal, target, contract/input digests, effects, and expiry. Headless calls without authority fail closed.

## Private agent profiles and bounded sessions

Pi implementation policy is loaded separately from the public contract:

```ts
import {
  createPiSdkAgentExecutorsFromProfiles,
  parsePiAgentProfiles,
  resolvePiAgentProfiles,
} from "@kybernetria/pi-protocol/pi/agents";

const profiles = resolvePiAgentProfiles(parsePiAgentProfiles(profileSource), packageDirectory);
const agents = createPiSdkAgentExecutorsFromProfiles(definition, profiles, {
  agentByProvide: { notify: "notification_agent" }
});
```

Prompt paths are contained below an explicit base directory and resolved prompt text never enters public discovery. Agent factories use explicit `createSessionForAgent`, `toPromptByAgent`, and `toOutputByAgent` options; callback arity is never interpreted.

Continuation sessions are keyed by principal, target, pinned contract digest, and opaque session ID. Creation is atomic, same-session prompts serialize, and TTL/LRU bounds apply. End, abort, contract replacement, eviction, and `disposeAllProtocolAgentSessions()` dispose retained SDK sessions. Protocol guidance is injected only for profiles whose tool list includes `protocol`; their nested calls inherit and attenuate the current invocation authority.

## Thin Pi projection

The canonical model-facing tool exposes only `list`, `search`, `describe`, and `call` (or direct `{ target, input }`). Discovery is cursor-paginated and bounded. It omits deployment identity, policy internals, binding names, and implementation kind; exact schema projection reports explicit truncation when its hard budget is reached.

Caller/principal identity, grant, trace/span IDs, deadline, cancellation, confirmation, and registration selection are host-owned and absent from the tool schema. Unknown fields and previous command spellings are rejected. Calls use `invokeTracked()` and return a canonical immutable receipt, including truthful `OUTCOME_UNKNOWN` states.

The Pi adapter has no independent concurrency queue: fabric admission is the single bounded scheduler. Persisted tool details are versioned strict JSON, root correlation IDs are projection-minted, and provenance payload previews, full registries, prompts, and streamed deltas are omitted. A pure bounded view model feeds Pi-native `Text`/`Markdown` components and host wrapping/truncation utilities.

## Conformance and diagnostics

The package publishes executable, bounded tooling:

```bash
pi-protocol check ./extension
pi-protocol check --recursive ~/.pi/agent/extensions
pi-protocol generate ./extension
pi-protocol generate ./extension --check
pi-protocol doctor --json
```

`check` performs canonical admission, recursive nested-package discovery, package/dependency checks, private prompt containment, and generated-artifact verification. `generate` atomically emits digest-stamped targets, exact binding types, and input/output aliases. `doctor` reports host ABI/package copies, registrations and draining generations, contract digests/source identity, queues, audit health, and session counts.

Extension tests can import `checkProtocolPackage`, `checkProtocolTree`, or `assertProtocolPackageConformance` from `@kybernetria/pi-protocol/conformance`. CI also enforces deterministic CLI bundles, tarball/isolated installation, and protocol performance ceilings.

## Runtime distribution

Ecosystem packages install normal package copies. The global host ABI converges compatible v4 copies onto one process-wide fabric and fails closed when an incompatible host is already live; no legacy fabric anchor or filesystem runtime linker is used.

## Development

```bash
npm run typecheck
npm test
npm run audit:extensions -- /absolute/path/to/extensions
```

`npm test` includes canonical and previous-version fixtures, adversarial admission cases, the existing runtime/adapter suite, a core import-boundary test, and package tarball installation in an isolated module root.

Architecture decisions are recorded under `docs/adr/`, including canonical admission/trust, owned atomic registrations, compatibility retirement, and the evidence-based deferral of generated native provide tools.
