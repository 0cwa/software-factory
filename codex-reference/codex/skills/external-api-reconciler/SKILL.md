---
name: external-api-reconciler
description: Reconcile desired or declarative state with a mutable external API while preserving stable identities and relationships, planning exact creates, updates, deletes, and no-ops, respecting pagination and rate limits, testing disposable records, applying in bounded batches, and detecting omissions. Use for service-state reconciliation, account or object migrations, recreating records, and API plan/apply workflows. Do not use for one-off API reads, ordinary local data transforms, or generic live changes without a desired-state comparison.
---

# External API Reconciler

Produce a deterministic reconciliation and recovery record. Compose with `safe-change-gate`; it owns authority, snapshots, dry-run, approval, receipt, verification, omission, and rollback semantics.

## Load the adapter contract

Read [Provider adapter](references/provider-adapter.md). Start provider-specific metadata from [Adapter Template](assets/provider-adapter.template.json). If `safe-change-gate` is unavailable, stop before constructing an apply workflow rather than redefining its contract.

## Workflow

1. Confirm desired-state authority and mutation authority separately. A request to inspect or dry-run does not authorize API writes.
2. Discover current API semantics from authoritative documentation and observed read-only behavior: authentication scope, object identifiers, pagination, filtering, relationship behavior, uniqueness, defaults, rate limits, idempotency, delete cascades, and secret handling.
3. Snapshot every in-scope object and relationship using stable provider IDs. Prove pagination completeness and retain a redacted digest.
4. Normalize desired and observed state without discarding unknown provider fields. Build an identity map before matching names or addresses.
5. Compute deterministic `create`, `update`, `delete`, and `no-op` operations. Make replacements explicit as create-and-cutover or delete-and-recreate sequences; do not hide them as updates.
6. Exercise uncertain semantics on disposable records when permitted. Record cleanup as part of the same safe-change run.
7. Dry-run the exact batch and assert protected-object, relationship, credential, and omission invariants. Re-snapshot on drift.
8. Apply idempotent bounded batches only with scoped approval. Respect retry and rate-limit semantics; stop after ambiguous responses rather than guessing.
9. Re-read from the provider source of truth, compare desired, before, plan, receipts, and after state, and disposition every omission.

## Hard gates

- Never assume list endpoints are complete without pagination evidence.
- Never match mutable display names when stable IDs exist.
- Never replace or delete an object until dependent identities and relationships have a recovery path.
- Never log credentials, generated passwords, API keys, or unredacted payloads.
- Never interpret an empty result caused by filtering, permissions, or rate limits as confirmed absence.
- Never retry a non-idempotent mutation after an ambiguous response without first re-reading state.

## Result

Return the provider capability record, full snapshot evidence, identity map, desired/observed normalization rules, deterministic plan, disposable-test results, safe-change artifact, per-operation receipts, omission report, recovery state, blockers, and next action.
