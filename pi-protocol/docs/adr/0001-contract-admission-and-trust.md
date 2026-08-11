# ADR 0001: Canonical contract admission and same-process trust

- Status: Accepted
- Date: 2026-07-29
- Scope: Pi Protocol vNext Phase 1

## Context

Pi Protocol is a self-describing capability kernel. Extensions are not known centrally, so a capability contract must be admitted before an implementation can be selected or invoked. The public identity is always `nodeId.provideName`; implementation aliases are private registration data.

The host loads ordinary Pi extensions in one process. Those extensions can already access process memory, the filesystem, and network APIs. Protocol policy can constrain model-mediated delegation and prevent accidental authority broadening, but cannot sandbox a malicious extension.

The previous v0.2 manifest mixed five authorities: public contracts, package identity, handler/agent aliases, private prompts/model policy, and presentation hints. It used a handwritten schema subset and accepted arbitrary JavaScript values at some boundaries.

## Decision

### Authority boundaries

- `package.json` owns package identity, version, entrypoints, and dependencies.
- `pi.protocol.json` v1 owns only public node/provide contracts.
- optional `pi.agents.json` will own private Pi agent profiles.
- runtime registration records will own implementation bindings and generations.
- provenance records will own actual requests, registrations, delegation, approvals, and outcomes.

No prompt or resolved prompt content belongs in the public contract registry or contract digest.

### Canonical wire contract

The checked-in `contract/manifest.schema.json` is authoritative. Canonical manifests declare:

- `$schema: https://pi.dev/protocol/manifest-v1.schema.json`
- `schemaVersion: 1`
- one node identity and purpose
- one or more provides with input/output schemas
- standardized effects and a small behavioral trait vocabulary
- optional lifecycle and namespaced extension metadata

Unknown protocol fields fail admission. A provider annotation may mark data with `x-pi-sensitive: true`; it cannot request broader capture.

### Admission order

Admission is fail-closed and has no registration side effects:

1. Bound source bytes.
2. Reject duplicate JSON object members.
3. Parse or inspect a strict JSON value.
4. Bound depth, nodes, collections, and strings.
5. Dispatch exactly by declared version; never downgrade after a v1 failure.
6. Validate the manifest with pinned Ajv JSON Schema 2020-12 settings that do not coerce, default, remove, or mutate data.
7. Enforce semantic and schema-complexity budgets.
8. Compile input/output validators once.
9. Normalize and deeply freeze the contract.
10. Compute a stable SHA-256 digest over canonical JSON.

Only a successfully admitted `ProtocolDefinition` may proceed to owned registration in Phase 2.

### Supported payload schema profile

The v1 profile supports strict JSON primitive/container types, required/properties/additionalProperties, items, enum/const, numeric and length ranges, a linear-time pattern subset, nullable type unions, bounded `oneOf`, acyclic local `$defs`/`$ref`, descriptions/examples, content annotations, and `x-pi-sensitive: true`.

Remote or cyclic references, backtracking-prone pattern constructs, executable transforms, mutation keywords, unbounded composition, and unknown keywords are rejected. References compile locally with manifest definitions. Prototype-sensitive schema map names are rejected because common validator/object implementations do not give them portable contract semantics. Ajv validates only own payload properties, so inherited object members cannot satisfy `required`.

### Compatibility

The reader accepts a structurally valid v0.2 manifest only through an explicit decoder. It emits a canonical v1 public contract plus a private compatibility sidecar containing old implementation bindings and agent metadata. Canonical output and documentation are v1 only.

Legacy free-form effects are mapped to standard effects. Unknown legacy effects are conservatively represented by all standard effects rather than silently understating authority. Compatibility use emits bounded diagnostics and can be disabled.

The existing root v0.2 helpers remain temporarily for ecosystem migration. They are deprecated and are not the canonical contract API.

### Import boundaries

`@kybernetria/pi-protocol/core` contains only the local fabric and its transport-neutral runtime types. Its runtime import graph excludes Ajv, filesystem manifest loading, Pi APIs, model APIs, tools, rendering, and agent sessions.

`@kybernetria/pi-protocol/contract` contains admission, normalization, fingerprints, validators, and compatibility decoding. The package root exports core plus contracts and temporary legacy local-fabric adapters, but does not eagerly import Pi tools or SDK sessions.

Pi-specific code remains under `/pi`, `/pi/agents`, `/tool`, and `/sdk` compatibility entrypoints. The old root convenience re-exports of Pi tool/SDK runtime code are intentionally absent because retaining them would eagerly cross the non-negotiable core boundary. Existing dedicated `/tool` and `/sdk` entrypoints remain as migration aliases. vNext phase commits are not published as a compatible 1.x release; ecosystem consumers are migrated repository-by-repository before the major release gate.

## Threat model

### Protected boundaries

- untrusted model/tool payloads entering contract validators
- extension manifests entering the host registry
- schema compilation and reference resolution
- public registry data versus private agent configuration
- package copies importing the core without optional Pi peers

### Threats addressed

- oversized/deep manifests and schemas
- cyclic, non-finite, BigInt, function, symbol, accessor, Proxy, and class-instance values
- duplicate JSON keys, inherited required fields, and prototype-sensitive schema names
- remote/cyclic references, backtracking-prone patterns, and unknown/executable schema keywords
- Ajv coercion/default/removal mutation
- downgrade fallback from malformed v1 to v0.2
- unstable digests caused by object key ordering
- diagnostic amplification and source-value disclosure
- accidental eager loading of Pi SDK/TUI/model modules from core
- legacy unknown effects understating authority

### Threats not addressed

- malicious same-process extensions
- operating-system/process isolation
- compromised npm packages or host runtime
- distributed transport authentication
- resource exhaustion inside an already trusted handler
- semantic correctness of provider descriptions

Those require host/package security or future transport/process boundaries, not manifest policy.

## Consequences

Positive:

- one immutable public contract model and digest
- validators exist before implementation binding
- deterministic dual-read/single-write migration
- bounded, non-mutating admission with stable failures
- core consumers do not require Pi peers

Costs:

- Ajv is a pinned runtime dependency of contract admission
- schema support is intentionally narrower than unrestricted JSON Schema
- v0.2 metadata requires a temporary compatibility sidecar
- schema/profile evolution requires a versioned manifest revision
- Phase 1 does not yet provide owned atomic registration or provenance; those remain later commit gates

## Verification

Phase 1 is gated by canonical/legacy fixtures, malformed and adversarial values, schema budgets, validator behavior, digest stability, import-graph tests, the existing suite, and package tarball installation in an isolated module root without optional Pi peers.
