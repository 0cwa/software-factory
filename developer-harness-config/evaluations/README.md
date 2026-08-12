# Evaluation Boundary

This directory contains portable evaluation guidance and references. It does not contain mutable runtime results, credentials, hidden provider state, or the only copy of held-out tasks.

## Ownership

- Software Factory executes exact workflow/candidate runs and records bounded operational evidence.
- Pi Protocol owns canonical capability receipts and causal provenance.
- Pi Foundry owns comparative evaluation schemas, compatibility evidence, provider/default recommendations, promotion proposals, and rollback records.

## Required evaluation identity

Every result binds:

- suite, task, rubric, held-in/held-out designation, and version;
- active/candidate workflow, graph, prompt/context, gate, policy, provider/model, Pi, Protocol, Factory, and Foundry identities;
- repository fixture/base/candidate commit/artifact digests;
- Foundry environment lock/receipt;
- evaluator implementation/config digest;
- budgets, cache/fresh status, sampling/repeat policy;
- deterministic checks, hard gates, objective metrics, and evidence refs.

## Hard gates

Workspace/protected-path, authority, source integrity, permission, recovery, cancellation, storage, redaction, held-out, evaluator integrity, current tests/reviews, and unknown-effect invariants cannot be outweighed by a score.

## Nondeterminism

Exact inputs are deterministic identity. Model/provider execution is behavioral evidence. Use repeats and visible dispersion/confidence when variance can affect promotion. Cached and fresh results remain distinct.

## Negative results

Retain rejected, inconclusive, superseded, stale, and rolled-back candidates with lineage, prediction outcome, failed gates/regressions, and bounded evidence references. Do not expose held-out task content to candidate context by default.

## Promotion

- Repository workflow/prompt/code changes: accepted candidate branch -> draft PR -> repository approval/integration.
- Environment/package/provider/default changes: normalized evidence -> exact Foundry proposal -> approval -> transaction/reload/verify.
- Combined changes use an explicit ordered plan; no opaque in-process self-promotion.

See:

- Factory evaluation issue: https://github.com/0cwa/software-factory/issues/22
- Factory security boundary: https://github.com/0cwa/software-factory/issues/23
- Foundry evaluation adapter: https://github.com/0cwa/pi-foundry/issues/34
- Foundry runner: https://github.com/0cwa/pi-foundry/issues/29
