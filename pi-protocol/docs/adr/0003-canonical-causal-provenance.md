# ADR 0003: Canonical causal provenance and cancellation truth

- Status: Accepted
- Date: 2026-07-29
- Scope: Pi Protocol vNext Phase 3

## Decision

The fabric owns a schema-version-1 causal ledger independent of Pi rendering and legacy preview recorders. Every registration lifecycle fact and tracked request is represented by a versioned immutable event; every tracked request receives a host-minted invocation ID and immutable receipt. Canonical invocation events contain identifiers, target, pinned registration generation/digest, bounded sizes, stable outcomes, timing, and fabric-created parent invocation links. Raw payloads, session IDs, runtime deltas, prompts, free-form executor errors, and source paths are omitted by default.

`invokeTracked()` is the receipt-bearing API. The old `invoke()` remains a compatibility projection. Nested tracked calls inherit a causal parent through out-of-band async context; caller-supplied trace and span fields are correlation data, not causal authority.

The in-memory ledger is bounded independently by event count, receipt count, and bytes. Events are deeply frozen and individually size-capped. Receipt lookup is default-deny, requires an opaque host authority accepted by a host authorizer, is rate limited, and bounds depth and result count. Missing and unauthorized receipts have the same result.

Audit sinks have two modes:

- `best_effort`: events enter a bounded asynchronous queue; sink delay/failure never blocks execution and drops are counted.
- `required`: the start event must be accepted within a bounded timeout before dispatch. Failure returns `AUDIT_UNAVAILABLE` and the binding does not run. Failure writing a terminal event never changes the actual execution result.

Progress and canonical audit observers are asynchronous, serial per observer, queue-bounded, and non-authoritative. Their failures or never-settling promises cannot affect execution; drops and failures are diagnostic counters.

Cancellation distinguishes intent from fact. Cancellation before dispatch is a recorded rejection with no possible effect. After dispatch, a caller may stop waiting and receive `OUTCOME_UNKNOWN` with the stable receipt. The binding remains generation-pinned and the ledger records its eventual success, failure, or confirmed cancellation. An uncooperative effect is never represented as safely cancelled.

## Consequences

- Canonical provenance is privacy-safe by default; legacy preview/runtime recorders remain opt-in compatibility surfaces.
- Best-effort sinks can lose data under overload and expose counters proving that fact.
- Required sink acceptance is not transactionally atomic with arbitrary effects; only pre-dispatch fail-closed behavior is guaranteed.
- Outcome-unknown work can keep old registrations draining indefinitely, truthfully reflecting non-cooperative execution.
- Durable transport, signatures, and cross-process ordering remain future concerns.
