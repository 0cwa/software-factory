# GitHub Issue Execution Protocol

Use this after an exact issue is selected and the constitution/orientation are loaded.

## Readiness

An issue is ready only when:

- repository and issue number are exact and open;
- no conflicting active Factory work unit or PR owns the same scope;
- explicit prerequisites/blockers are closed or verified;
- coordinating epic/ADR/schema authority is known;
- scope, non-goals, acceptance criteria, and expected evidence are sufficient;
- required cross-repository work is already split or can be represented as a linked blocker;
- the environment can be verified/assembled through Foundry;
- no missing owner/product decision materially changes the implementation.

Return a structured readiness result. Do not begin by guessing missing requirements.

## Create the work unit

Bind:

- issue/repository URLs and current issue content digest;
- coordinating epic and direct prerequisite IDs/digests;
- exact base branch/commit and repository identity;
- selected Factory workflow/variant/graph digest;
- Foundry environment lock/receipt;
- developer-config prompt/policy/toolset digests;
- scope/non-goals/acceptance criteria;
- expected checks/review/security/PR behavior;
- budgets, approvals, protected paths, and stop conditions.

Generate an active plan from `templates/issue-plan.md`; it is a bounded projection, not a new backlog authority.

## Inspect and plan

1. Inspect the exact current implementation/tests/docs named by the issue.
2. Search for affected boundaries and similar patterns; avoid broad unbounded repository scans.
3. Establish clean baseline commands/results before edits.
4. Identify dependency/source changes and create authoritative blockers rather than modifying copied source.
5. Produce an implementable plan with target modules, sequence, tests, risks, and acceptance mapping.
6. Use a reviewer/owner approval only where the issue/policy requires it; routine details proceed from evidence.

## Candidate workspace

- Create a Factory-owned branch/worktree from the exact base commit.
- Preserve the engineer's active dirty tree.
- Limit mutations to issue-approved paths/effects; protect Factory/Foundry policy, evaluator, workflow, and desired-state files unless the issue explicitly targets them under the self-hosting process.
- Record actual changed/deleted/reverted/ref/config paths after every mutating phase.
- Never commit directly to the target branch.

## Implementation workflow

Use the most specific reviewed workflow; normally `software-change`:

```text
plan
-> implement
-> deterministic quality commands
-> bounded same-session fix on failure
-> independent review
-> bounded revision on blocking findings
-> mandatory rerun of invalidated checks
-> optional security/documentation phases
-> explicit acceptance
-> candidate commit and draft PR
```

Known commands remain code phases. Agent envelopes are typed and verified against actual repository state.

## Evidence invalidation

Each test, review, gate, and acceptance result binds exact candidate/config/environment inputs. Any relevant later mutation invalidates it. No accepted path may rely on stale green evidence.

After every correction/revision:

- recompute actual diff/allowed paths;
- rerun all invalidated deterministic checks;
- rerun review/security when its input changed materially;
- update the active plan and evidence refs, not the issue scope.

## Draft PR

After acceptance:

1. create intentional candidate commits according to repository policy;
2. verify base/head and no unrelated files/secrets/runtime artifacts;
3. push the Factory-owned branch;
4. open or update a **draft** PR linked to the issue;
5. include:
   - summary and scope;
   - implementation plan/decisions;
   - exact checks and results;
   - review/security findings and dispositions;
   - Factory run/environment/evidence refs;
   - remaining risks/unknowns/manual steps;
   - migration/rollback where relevant.
6. add a bounded issue comment linking the draft PR and run evidence.

Default policy does not merge, close the issue, force-push the target branch, or rewrite issue scope.

## Cross-repository work

When the issue requires a dependency change:

- create/link a focused issue in the authoritative repository;
- write the consumer contract/fixture in the consumer issue/PR where appropriate;
- record exact interim source mode/commit if approved for dogfooding;
- create an explicit child work unit or stop as blocked;
- never patch the dependency copy in the wrong repository.

## Recovery

On interruption:

- inspect the Factory journal/current phase/worktree/Protocol receipts/GitHub branch-PR state;
- verify whether the last external effect completed;
- resume only from a safe/verifiable transition;
- never duplicate a branch/PR/comment or replay an unknown effect;
- retain candidate/evidence and return the exact recovery choice.

## Stop conditions

Stop before draft PR when:

- readiness/dependency/base/environment became stale;
- scope expands beyond accepted issue/non-goals;
- a product/owner decision is necessary;
- credentials or approved capability are unavailable;
- an effectful operation has unknown outcome;
- protected self-hosting policy is triggered without its trusted controller;
- deterministic checks cannot be run or remain red/stale;
- independent review/security remains blocking;
- unauthorized/protected mutations occurred;
- evidence/storage/recovery integrity is compromised.

Report the precise blocker, evidence already obtained, candidate location, and one next action. Do not ask a vague “what should I do?” question.
