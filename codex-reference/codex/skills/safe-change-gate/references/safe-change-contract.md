# Safe-Change Contract

`safe-change-run@1.0.0` is the canonical cross-domain record for a potentially risky mutation. Keep provider commands, payload schemas, and domain semantics in adapters.

## Lifecycle

`draft → snapshotted → planned → dry-run-verified → approved → applying → verifying → complete`

`blocked` may be entered from any phase. `rolled-back` is terminal only after rollback verification. Do not advance merely because a command ran; each phase requires its observable evidence.

## Target and scope

Record a stable target identity, environment, and included and excluded objects. Distinguish a logical name from the provider or system identifier. Resolve aliases, profiles, regions, tenants, repositories, branches, and namespaces before mutation.

## Authority

Track read, write, external, live, destructive, and privileged dimensions independently. `approval-required` is not `allowed`. Approval records must identify the exact dimensions and batch scope. Expired, denied, ambiguous, or broader prior approvals do not authorize the current batch.

## Work-unit bridge

A work unit may reference this run as an artifact, but the records answer different questions. Work-unit authority controls whether the task is ready to proceed; this run's approval controls whether the exact mutation batch may be applied. Keep the plan, approval, per-operation receipts, omission proof, and rollback state only in this run. A general implementation request or allowed work-unit write dimension never substitutes for scoped apply approval.

## Snapshots and plan

The before snapshot must support both change calculation and omission detection. Store a redacted artifact reference, digest, capture time, and scope. A plan operation includes a stable ID, action, target identity, expected effect, destructiveness, reversibility, and preconditions.

Plans are invalid after target drift, adapter-version changes that affect semantics, or scope changes. Re-snapshot and recompute instead of patching stale operations manually.

## Dry run

Record the exact command or procedure, exit status, predicted operation IDs, invariant results, and any observed side effects. A simulator that writes test records, refreshes remote timestamps, sends notifications, acquires persistent locks, or mutates caches is a test apply and requires write authority.

## Apply receipts

Emit one receipt for every planned operation, including skipped and failed operations. Bind each receipt to the operation ID, observed result, evidence location, and timestamp. Never store secrets or full sensitive payloads.

## Verification and omissions

Re-read from the target source of truth. Verify intended postconditions and explicitly protected unchanged conditions. Compare before, plan, receipts, and after state. Disposition every omitted object as explained, restored, or unresolved; `complete` forbids unresolved omissions.

## Rollback

Record the trigger condition, procedure, required authority, reversibility limits, and status before apply. Rollback is not guaranteed merely because an operation is labeled reversible. Verify the restored state and retain both forward and rollback receipts.

## Contract evolution

Adapters may add namespaced optional fields. Removing, renaming, or changing required semantics requires a new major version or compatibility layer and migration decision.
