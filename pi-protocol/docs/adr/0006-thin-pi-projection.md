# ADR 0006: Thin, host-authoritative Pi projection

Status: accepted

## Context

The Pi tool adapter exposed two overlapping command vocabularies, a raw registry operation, implementation kind, deployment metadata, policy internals, and advanced request fields that a model could use to claim caller or trace identity. It also added a second concurrency queue in front of the fabric and correlated live traces with caller-supplied IDs. Discovery and persisted tool details had no complete aggregate bound.

## Decision

The model-facing projection has four operations: `list`, `search`, `describe`, and `call`. A known `target` implies `call`. Its schema exposes target/input, bounded discovery filters, opaque pagination cursors, and session continuation only. Principal, grant, caller, causal IDs, deadline, cancellation, confirmation, and registration selection remain host-owned.

Pi's `prepareArguments()` migration decoder still accepts `action`, `invoke`, `registry`, split describe operations, and nested `request`, but strips identity, trace, cancellation, and other authority-bearing fields. Conflicting aliases fail with one bounded `INVALID_REQUEST` result. Canonical details carry `schemaVersion: 1` and `op`; legacy renderer discriminants remain temporarily for historical Pi session entries.

Discovery is paginated at at most 50 records and omits package/deployment identity, policy, handler/agent kind, and binding names. Exact schema projection has explicit value/character/depth bounds and reports truncation. Trace correlation is projection-minted at roots, trace payload previews and streamed deltas are removed from persisted details, and no registry snapshot is retained by the renderer.

Calls use `fabric.invokeTracked()`, include the immutable canonical receipt, and preserve `OUTCOME_UNKNOWN` rather than inventing an aborted outcome. The projection does not own a scheduler; fabric admission is the single bounded concurrency/queue authority. Update callback failures are observational and cannot change execution. A pure bounded view model feeds Pi-native `Text`/`Markdown` components and host width/wrapping utilities; provider color escape generation and custom ANSI parsing are absent.

## Consequences

New prompts and integrations use only the canonical operations. Legacy inputs remain readable during the migration window but are not advertised. Model-facing discovery is intentionally implementation-neutral and may require cursor continuation. A truncated schema projection signals that a host SDK consumer, rather than a model tool call, is needed for the complete admitted contract.
