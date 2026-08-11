# ADR 0011: Defer native generated provide tools

## Status

Accepted

## Context

Phase 10 reserved an experiment in which inactive protocol provides could be projected as generated native model tools. This would increase the model-visible tool catalog and introduce synchronization concerns when owned registrations are installed, replaced, drained, or removed.

The autonomous orchestration evaluation already exercises an extension installed after bootstrap, lexical discovery, direct invocation from a compact signature, composition, delegated agents, recovery, grants, budgets, continuation, replacement, and causal explanation. It reports discovery precision and recall of 1, zero schema-invalid calls, zero unnecessary describe calls, full workflow completion, and successful use of the unknown extension. The measured tokens-to-first-valid-invocation is 35.

## Decision

Do not add generated inactive provide tools in v3. The evidence does not identify a discovery or invocation deficit that offsets the additional model context, tool-name collision policy, lifecycle synchronization, and stale-authority risk.

Keep the single bounded `protocol` projection with `list`, `search`, `describe`, and `call`. Reopen the experiment only when repeated evaluations show a measurable regression in discovery recall, tokens to first valid call, schema-invalid call rate, or workflow completion that cannot be corrected in the compact projection.

## Consequences

- No generated-tool code or extra model-visible authority surface is added.
- Dynamic extension installation and atomic replacement remain naturally represented by the fabric catalog.
- The orchestration metrics provide explicit thresholds for deciding whether to revisit the experiment.
