---
name: safe-change-gate
description: Stage risky mutations through target resolution, authority preflight, snapshots, a deterministic plan, side-effect-free dry-run evidence, scoped approval, minimal apply batches, postcondition and omission proof, and rollback. Use for live or external APIs, production services, installers, migrations, privileged systems, destructive operations, or requests such as "dry run first," "no writes," and "show what would change." Do not use for ordinary local workspace edits or purely read-only analysis with no mutation path.
---

# Safe Change Gate

Provide universal safety choreography while domain skills provide target-specific commands and semantics. Never treat loading this skill as authority to mutate a target.

## Resolve the run

Read [Safe-change contract](references/safe-change-contract.md) and create a `safe-change-run@1.0.0` artifact from [Run Template](assets/safe-change-run.template.json) when the task may reach an apply step. Validate it with `scripts/validate_safe_change.py ARTIFACT` after every phase transition.

Resolve the exact target, environment, object identities, writable scope, and concurrent actors before planning. Stop on ambiguous production versus test targets.

## Workflow

1. Record separate authority for read, write, external, live, destructive, and privileged actions. A request for a preview or dry run authorizes no writes.
2. Capture a before snapshot broad enough to detect changed, missing, and unexpectedly created objects. Preserve stable identities and relationships, not only display names.
3. Produce deterministic create, update, delete, and no-op operations with preconditions, reversibility, and expected effects. Make destructive operations visually explicit.
4. Prove the proposed dry run is side-effect free, including caches, lockfiles, test records, remote timestamps, notifications, and implicit migrations. If it cannot be side-effect free, label it a test apply and require matching authority.
5. Verify invariants and compare the plan with the user-authorized scope. Request only the missing authority for the exact batch; do not request blanket approval early.
6. Apply the smallest independently verifiable batch. Capture one receipt per operation and stop on scope drift, precondition failure, unexplained omission, or partial failure.
7. Re-read the target from its source of truth. Prove postconditions, unchanged invariants, no unexplained omissions, and rollback readiness.
8. Roll back when a recorded condition fires and rollback remains safer than forward repair. Verify rollback as another state transition.

## Hard gates

- Never infer live, external, privileged, destructive, commit, or push authority from a general implementation request.
- Never call an operation dry-run merely because it avoids the primary write; account for every side effect.
- Never apply from an old snapshot after target drift; re-snapshot and regenerate the plan.
- Never treat a successful command exit as proof of target state.
- Never hide skipped, missing, or newly created objects inside aggregate counts.
- Never embed credentials, private keys, recovery codes, or raw secret-bearing payloads in artifacts or receipts.

## Composition

Use `external-api-reconciler` for declarative API migrations and `provenance-audit-reset` for provenance-sensitive repository work. Domain adapters may add namespaced fields but must not redefine authority, approval, receipt, omission, or rollback semantics.

When a staged work unit leads to risky mutation, keep task readiness in the work unit and the mutation lifecycle in `safe-change-run@1.0.0`. Link the run artifact from the work unit; never duplicate its exact plan, scoped approval, operation receipts, omissions, or rollback state there. General work-unit write authority does not approve an apply batch.

## Result

Return the resolved target and scope, authority state, before snapshot, exact plan, dry-run evidence, approval boundary, apply receipts, after snapshot, postconditions, omissions and dispositions, rollback state, blockers, and one next action.
