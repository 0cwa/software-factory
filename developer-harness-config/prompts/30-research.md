# Research Protocol

Use this for architecture, dependency, compatibility, library, security, current-version, or unfamiliar-source questions.

## Evidence classes

Label conclusions as one of:

- **source fact** — directly supported by current code, official documentation, package metadata, schema, test, or issue/PR;
- **verified experiment** — supported by an exact recorded command/fixture/result;
- **inference** — reasoned from named source facts, with uncertainty stated;
- **proposal** — a recommended design not yet implemented or tested;
- **unknown** — evidence is absent, stale, conflicting, or inaccessible.

Never present inference, discovery, package existence, semver claims, or one machine result as reviewed compatibility.

## Research sequence

1. Restate the exact decision/question and why it affects implementation.
2. Read the authoritative issue, accepted ADRs/schemas, and relevant current source/tests.
3. Inspect the current exact external repository/package/official documentation when facts may have changed.
4. Identify the smallest unresolved facts that could change the decision.
5. Prefer source/doc reasoning when semantics are explicit.
6. Define an executable acceptance test—not an open-ended spike—where behavior is platform/runtime/provider dependent.
7. Compare alternatives against the project's actual boundaries: authority, recovery, portability, storage, maintenance, evaluation, and migration.
8. Record exact repositories/commits/versions/dates/paths/commands and any unavailable evidence.
9. Turn confirmed implementation work into dependency-linked GitHub issues in the authoritative repository.
10. Update the coordinating issue/ADR only when the conclusion changes the architecture.

## Source priority

For technical behavior, prefer:

1. current implementation and executable tests;
2. current official project documentation/schema/API;
3. official release/package metadata;
4. primary research papers/specifications;
5. high-quality secondary analysis;
6. community anecdotes only as leads or evidence of failure modes.

For attached/source materials explicitly supplied by the owner, preserve their terminology and framing. Distinguish expansions or corrections from what the source itself supports.

## Avoid unnecessary spikes

A spike may be unnecessary when:

- current source and tests define command construction, precedence, schema, or patch semantics;
- a mature focused library already has an explicit contract and Foundry/Factory only needs normal adapter acceptance tests;
- the question is a product/authority decision already fixed by owner direction;
- the remaining work is routine cross-platform/real-package validation attached to implementation.

A real experiment remains necessary when:

- filesystem/process/reload/open-file behavior varies by OS;
- external model/provider behavior is nondeterministic;
- exact selected package graphs/lifecycle scripts must be observed;
- offline rollback or crash recovery depends on real side effects;
- public contracts appear incompatible across independent packages;
- security guarantees cannot be inferred from API documentation.

Do not use “spike” as a substitute for writing a precise failing/passing matrix.

## Library selection

Prefer a focused mature library when it removes undifferentiated infrastructure or cross-platform edge cases. Keep product semantics custom where they define:

- ownership and precedence;
- workflow/operation ordering;
- proposal/candidate digest contents;
- acceptance, recovery, authority, conformance, and promotion;
- managed-state diff/merge;
- adapter selection.

Every proposed runtime dependency needs an owner module/port, exact capabilities used, security/data boundary, contract tests, update policy, payload impact, and replacement path. Avoid broad frameworks without measured repeated boilerplate.

## Comparative recommendation format

For each serious alternative state:

- what it owns;
- integration/release boundary;
- advantages;
- disadvantages/failure modes;
- development and maintenance load;
- security/recovery implications;
- compatibility/evidence status;
- migration/rollback path;
- recommendation and decision gate.

Do not force a binary choice when a backend hierarchy or selectable variant preserves orthogonality better.

## Research outputs

A completed research task should yield:

- concise executive conclusion;
- evidence table with exact identities;
- settled decisions versus remaining acceptance tests;
- architecture/roadmap impact;
- issues created/updated with full context and links;
- no unsupported claims that work was tested or completed.

If access or evidence is insufficient, state exactly what was inspected and what remains unknown. Do not hide the gap with generic knowledge.
