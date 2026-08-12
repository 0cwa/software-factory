# Review, Evaluation, and Promotion Protocol

Use this for candidate review, workflow/prompt/provider comparison, self-hosting changes, and promotion decisions.

## Review layers

Keep separate:

1. **Static admission** — schemas, graph paths, authority, effects, protected paths, source identity, budgets.
2. **Deterministic verification** — tests, typecheck, lint, build, file/diff/API behavior, recovery/fault checks.
3. **Semantic review** — whether the implementation satisfies the issue/plan and is maintainable.
4. **Security review** — privilege, prompt injection, supply chain, path/process/storage/evidence/recovery risks.
5. **Behavioral evaluation** — repeated task performance and multi-objective tradeoffs.
6. **Promotion approval** — exact repository PR and/or Foundry proposal against current base state.

Passing one layer does not imply another.

## Candidate change manifesto

Before evaluation, record:

- exact parent/active candidate and changed surfaces;
- motivating failure/evidence pattern;
- root-cause hypothesis;
- structural, path-set, authority/effect, prompt/context-size, provider/source, and policy diff;
- expected fixes;
- at-risk regressions;
- held-in and held-out suites;
- hard invariants and protected metrics;
- repeat/cache/nondeterminism policy;
- budgets and protected evaluator/policy identities;
- prediction to mark confirmed, partial, rejected, or inconclusive.

Use `templates/harness-change-manifest.md`.

## Protected boundary

A candidate cannot edit or choose replacements for:

- the evaluator and held-out tasks judging it;
- hard workspace/security/storage/recovery gates;
- permission, authority, budget, retention, or promotion policy;
- active workflow/prompt bytes during its own run;
- Foundry transaction/approval policy;
- Protocol host/grant/receipt implementation;
- credentials or evidence records.

A protected self-hosting change uses the prior trusted controller, external fixtures, independent review, explicit owner approval, and retained rollback.

## Evidence requirements

Each result binds:

- exact workflow/graph/prompt/context/gate/policy/provider/model/Pi/Protocol identities;
- issue/task/fixture/base/candidate commit and artifact digests;
- environment lock/receipt;
- deterministic checks and stale/invalidated status;
- Protocol receipt refs and truthful unknown outcomes;
- repeats, cache status, dispersion/confidence where model variance matters;
- resource/permission/storage/recovery metrics;
- evaluator/rubric identity and freshness.

Unknown/missing evidence remains unknown. Never convert it to zero cost, no permission, or pass.

## Hard invariants

Reject/block regardless of aggregate score when:

- source/package/patch identity is unverified;
- two top-level workflow authorities are active;
- protected/unauthorized workspace changes occurred;
- accepted evidence is stale or required tests/reviews are missing/red;
- an effectful outcome is unresolved/unknown;
- permission/effect/network/global/script/secret surface expanded without approval;
- recovery, storage, redaction, retention, or cancellation truthfulness regressed;
- evaluator/policy/held-out integrity changed;
- held-out anti-overfitting thresholds fail;
- candidate cannot be reproduced/rolled back under its declared conformance.

## Multi-objective comparison

Compare, with units/source/confidence:

- task correctness and acceptance;
- plan/build/review quality claims;
- capability/tool error rates;
- tokens/context/model cost;
- latency/turns/retries/manual interventions;
- correction effectiveness;
- storage/trace growth;
- recovery reliability;
- permission/authority surface;
- graph/config/context complexity;
- update/patch/maintenance burden;
- operator comprehension and migration cost.

Keep a bounded Pareto set where tradeoffs differ materially. A scalar score may summarize but never replaces hard gates or visible tradeoffs.

## Negative evidence

Preserve rejected, inconclusive, superseded, and partially successful candidates with:

- exact inputs/lineage;
- failed/regressed metrics and hard gates;
- prediction outcome;
- conditions where it worked or failed;
- bounded evidence refs after raw retention expires.

Do not rerun an already falsified candidate without a material change/hypothesis.

## Promotion flow

### Repository-owned code/workflow/prompt changes

1. Candidate reaches `promotable` under protected evidence.
2. Factory creates/updates a draft PR from the isolated candidate branch.
3. Revalidate target base, exact diff, tests, review/security, and migration/rollback.
4. Human/authorized repository policy approves integration.
5. Post-integration verification records the exact commit and result.

### Environment/package/provider/variant changes

1. Candidate evidence is normalized into Foundry.
2. Foundry re-inspects active base/environment and eligibility.
3. Foundry produces one exact proposal with package/settings/source/authority/reload/rollback operations.
4. Human/policy approves the proposal digest.
5. Foundry applies, reloads/restarts, verifies, and records promotion/rollback.

### Combined changes

Order by ownership and dependency. Normally repository definitions/adapter compatibility are reviewed in a PR, then Foundry selects/releases the exact compatible artifact/variant. Never hide both inside one unreviewable self-update.

## Promotion classifications

Use explicit states:

- `promotable`
- `rejected`
- `inconclusive`
- `blocked`
- `stale`
- `superseded`
- `promoted`
- `rolled-back`
- `retired`

A promotable classification is not active state.

## Final review output

Report:

- candidate and exact base;
- change/hypothesis/prediction;
- hard-gate status;
- deterministic and behavioral evidence;
- held-out/repeat/cache status;
- objective tradeoffs and regressions;
- remaining unknowns/approvals;
- recommended classification;
- exact PR/Foundry proposal/rollback next action.

Do not claim improvement merely because a candidate completed or an evaluator produced a fluent explanation.
