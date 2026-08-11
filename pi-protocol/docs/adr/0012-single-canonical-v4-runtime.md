# ADR 0012: Ship one canonical v4 runtime surface

## Status

Accepted.

## Context

The v3 runtime retired raw registration and schema-evaluator compatibility, but still retained several migration surfaces: v0.2 contract decoding, previous Pi tool command spellings, the result-only `ProtocolFabric.invoke()` projection, the old global fabric symbol, alternate package entrypoints, preview recorders, a deprecated tool concurrency option, and the pre-`ModelRuntime` Pi SDK path. Those surfaces increased the number of admission, invocation, observation, and deployment behaviors despite the ecosystem already using canonical v1 contracts.

## Decision

Pi Protocol v4 has one production path for each boundary:

- Contract admission accepts only canonical schema-version-1 manifests.
- The model tool accepts only `list`, `search`, `describe`, `call`, and direct `{ target, input }` requests. Unknown fields fail closed.
- Receipt-bearing `invokeTracked()` and principal-bound `invokeAs()` are the fabric invocation APIs.
- The structural host ABI is the only process-global fabric anchor. ABI version 2 requires fabric ABI 10.
- Canonical package entrypoints are `/contract`, `/core`, `/provenance`, `/conformance`, `/pi`, and `/pi/agents`.
- Canonical audit events and receipts replace preview provenance recorders. Bounded ephemeral `ExecutionEventV1` observations preserve agent model and streaming updates without persisting prompts or output snapshots.
- Current Pi `ModelRuntime` is required for profile model resolution.
- Continued private sessions require host-owned principal and contract-digest context; anonymous compatibility identities are not minted.

Historical decoders and aliases remain available from signed v3 tags for offline migration, not from the v4 runtime.

## Consequences

All extensions must pin v4, use canonical entrypoints, and migrate result-only test calls to `invokeTracked()`. A v3 runtime cannot join a live v4 host and fails closed. Agents retain bounded discovery, exact schema description, validated provide invocation, continuation, streaming updates, receipts, and causal provenance through the canonical Pi projection.
