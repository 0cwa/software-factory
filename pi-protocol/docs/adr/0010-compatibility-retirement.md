# ADR 0010: Retire runtime compatibility infrastructure

## Status

Superseded by ADR 0012

## Context

All discovered ecosystem extensions now admit canonical schema-version 1 contracts, install exact owned bindings, retain their registration leases, and dispose those leases during shutdown. Recursive conformance and the autonomous orchestration evaluation pass without a v0.2 runtime registration consumer. Keeping mutation paths that bypass canonical admission would preserve two trust models and make ownership, generation pinning, and contract validation conditional.

## Decision

The v3 runtime removes `ProtocolFabric.register()` and `ProtocolFabric.unregister()`, the root v0.2 manifest registration helpers, the legacy schema evaluator, unowned-registration diagnostics, and the manifest-backed SDK agent factory. Registrations can enter and leave the fabric only through `install()` and the returned ownership lease.

The fabric ABI advances to version 9 so a process cannot silently combine a runtime that exposes raw mutation with one that requires owned registrations. Canonical error codes replace the old `INVALID_INPUT`, `INVALID_OUTPUT`, `POLICY_DENIED`, and `ABORTED` aliases.

A bounded v0.2 decoder remains only in canonical contract admission for previous-version fixtures and offline migration. Production conformance rejects it by default, and production extensions use strict v1 admission. Private deployment policy remains in `pi.agents.json` profiles.

The compatibility-retired runtime is distributed as `@kybernetria/pi-protocol@3.0.3` from the portable GitHub release artifact. All ten recursively discovered ecosystem packages pin that artifact and pass their package tests plus executable conformance.

Test fixtures use a test-only helper that creates canonical definitions and owned registrations. No production compatibility registration path is retained for tests.

## Consequences

- Raw or unowned registration is structurally impossible through the public fabric API.
- Removal requires a major package release and ecosystem dependency refresh.
- Mixed v2/v3 runtime copies fail closed rather than sharing a partially compatible fabric.
- Previous-version decoding remains executable and bounded without becoming a second runtime trust path.
