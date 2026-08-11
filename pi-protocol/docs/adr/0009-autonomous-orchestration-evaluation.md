# ADR 0009: Bootstrap-only autonomous orchestration evaluation

- Status: accepted
- Date: 2026-07-29

## Context

Architecture and conformance tests establish safety properties but do not show that an initially protocol-naive agent can discover and compose capabilities without native one-tool-per-provide projection. The deferred native-tool experiment needs a measured generic-tool baseline.

## Decision

`scripts/evaluate-orchestration.ts` creates an isolated repeatable fabric and an autonomous bootstrap agent whose only runtime interface is the canonical `protocol` tool. The agent is instantiated before the unknown-extension fixture is installed. It cannot inspect the fabric or fixture bindings directly.

The evaluation covers all required scenarios:

1. discover and invoke an unknown capability;
2. compose one provide's strict JSON output into another;
3. delegate through two agent-backed provides;
4. recover only a failed branch using its receipt identity;
5. preserve an attenuated child grant;
6. stop recursive work under call/depth/deadline controls;
7. avoid retrying an unsafe effect;
8. resume and end a bounded continuable operation;
9. handle generation-pinned atomic replacement;
10. explain the bounded causal chain of a final artifact.

The tool projection now includes a bounded `causal` summary assembled only from canonical audit events observed during that exact tool call. It contains invocation IDs, parent links, targets, terminal states, outcome codes, and effect-possibility flags. It contains no payloads, prompts, session IDs, source paths, free-form errors, or unrelated concurrent invocations.

CI fails unless the deterministic baseline achieves:

- all ten workflows complete;
- discovery precision and recall are 1.0;
- schema-invalid call rate is zero;
- no unnecessary describe calls;
- no duplicate effects;
- failed-branch recovery succeeds;
- no loop/fan-out violations;
- provenance completeness is 1.0;
- the post-bootstrap unknown extension succeeds.

The evaluation also reports estimated tokens to first valid invocation, average delegation depth, elapsed latency, and model cost. The deterministic baseline has zero model cost; a future model-backed runner can implement the same bootstrap interface and metric contract.

## Consequences

- Generic search/describe/call has an executable quality baseline rather than an architectural assumption.
- Causal repair and explanation are possible from privacy-preserving call-local receipt summaries.
- Performance and orchestration regressions are CI-visible.
- Generated inactive native tools remain deferred. They should be adopted only if a controlled model-backed comparison improves completion or token cost without weakening authority, context, or rendering invariants.
