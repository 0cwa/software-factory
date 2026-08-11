# ADR 0004: Bounded delegated invocation

- Status: Accepted
- Date: 2026-07-29
- Scope: Pi Protocol vNext Phase 4

## Decision

Canonical authority is carried out-of-band in async invocation context. Hosts mint frozen principals; request and model payloads cannot construct a valid principal. Root calls use `invokeAs(principal, target, input, options)` with an allow-only grant. Compatibility `invoke()` runs as the local system principal, but caller-supplied trace and caller fields never become canonical principal or causal authority.

Grants constrain exact targets or node wildcards, optional standard effects, maximum delegation depth, and total invocations. Nested grants are intersections. One root counter is shared by all descendants, and discovery uses the active grant so a caller cannot see unusable targets.

Handlers receive `context.invoke()`, the host principal, an absolute deadline, a linked cancellation signal, remaining budget, and non-blocking progress. Child calls inherit the same principal and root budget, increment depth, intersect any requested child grant, and can only shorten deadline/cancellation.

The fabric enforces bounded global concurrency and a bounded FIFO waiting queue. Queue cancellation and deadline expiry remove waiters. Admission failures use stable codes and never execute a binding.

Effects use the manifest's standardized vocabulary. Grants can restrict effects independently of target names. `external.transaction` and `system.configure` require confirmation by default. The host confirmation broker receives principal, target, contract/input digests, exact effects, and expiry. Approval is single-operation and out-of-band; absence or denial fails closed. Approval lifecycle is canonical provenance.

## Consequences

- Policy attenuates model-mediated delegation and accidental misuse; same-process extensions remain fully trusted code.
- Legacy direct host calls remain unrestricted unless invoked inside an attenuated context.
- Non-cooperative execution can outlive deadline/cancellation and is reported as outcome unknown rather than safely cancelled.
- The concurrency slot and registration generation stay leased until actual settlement, not merely until the caller stops waiting.
