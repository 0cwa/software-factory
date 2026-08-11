# ADR 0002: Owned atomic registrations and structural host ABI

- Status: Accepted
- Date: 2026-07-29
- Scope: Pi Protocol vNext Phase 2

## Decision

Canonical `ProtocolDefinition` objects are installed through an ownership lease. Admission marks definitions with a process-wide structural ABI marker; the fabric rejects fabricated or mutable definitions. Every declared provide must have exactly one callable binding under its provide name, across `handlers` and `agents`. Missing, duplicate, inherited, accessor, symbol, and extra bindings fail before publication.

An installation receives one registration ID and generation 1. Replacement validates the complete definition and exact bindings before one synchronous map publication. It retains the registration ID, increments the generation, and affects only subsequent lookups. Calls increment an in-flight lease on the exact registration object they selected, so replacement cannot switch their implementation or validator. Old bindings enter draining and dispose only after those calls and their terminal provenance records complete.

Only the closure-backed `ProtocolRegistration` lease can replace or remove an owned registration. The raw mutation APIs were removed after ecosystem migration (ADR 0010). Failed preparation or ownership checks leave the active generation unchanged.

Registration lifecycle facts are written to a bounded in-memory ring before/at publication and projected to non-blocking observers. Canonical invocation provenance includes registration ID, generation, and contract digest. Phase 3 replaces this transitional event surface with the canonical audit sink and receipt model.

The process-global anchor is a structural host object under `Symbol.for("@kybernetria/pi-protocol.host.v1")`. Compatible physical package copies connect to the live fabric and report package version/module URL. Any incompatible live host or legacy fabric fails loudly and is never replaced. The old fabric symbol remains only as a compatible bridge during migration.

## Consequences

- Public call identity remains `nodeId.provideName`; implementation aliases are unnecessary for canonical registrations.
- Atomic replacement is lock-free in the single JavaScript process, while resource disposal is asynchronous and drain-aware.
- A replacement can be visible to new calls while its returned promise waits for old resources to drain.
- Same-process code can still intentionally subvert JavaScript state; the ownership mark and lease prevent accidental misuse, not malicious extensions.
- Raw v0.2 registration remains temporarily for migration and does not gain ownership semantics.
