---
name: work-unit-core
description: Create, validate, transition, and select ready work units or ledgers using the versioned JSON contract. Use for direct ledger or contract maintenance. Do not use for project orchestration, handoffs, ordinary planning, implementation, or status.
---

# Work Unit Core

Manage work-unit artifacts without redefining their lifecycle, authority, evidence, or readiness semantics.

## Use the CLI

Run `scripts/work_unit.py` relative to this skill directory. Prefer running it without reading its source.

```text
work_unit.py init --work-id ID --objective TEXT --workspace PATH --output unit.json
work_unit.py init-ledger --ledger-id ID --objective TEXT --output ledger.json
work_unit.py add --ledger ledger.json --unit unit.json
work_unit.py update ARTIFACT --work-id ID --patch fields.json
work_unit.py validate ARTIFACT [--extension-registry REGISTRY] [--extension-schema NAMESPACE=SCHEMA]
work_unit.py ready LEDGER [--mark]
work_unit.py transition ARTIFACT --work-id ID --to STATUS [--next-action TEXT]
work_unit.py next ARTIFACT
```

Use `--help` on a command when its arguments are unclear.

`ready` lists dependency-ready candidates whose dependencies are complete and blockers are closed; `ready --mark` refuses common dependency-waiting next actions. `next` returns the first candidate in ledger order; when none exists, it returns the current incomplete unit by lifecycle priority and may therefore return a blocked unit.

## Contract rules

- Treat `contracts/work-unit-v1.schema.json` and `contracts/work-unit-ledger-v1.schema.json` as the canonical field contracts. Read them only when constructing fields manually or diagnosing validation errors.
- Use `update` for atomic structured changes to scope, authority, owner, dependencies, gates, deliverables, evidence, blockers, next action, or extensions. It rejects invalid patches without rewriting the artifact; use `transition` for lifecycle status.
- In the source family, artifact commands automatically resolve every present extension through `../../extension-registry.json`. Elsewhere, pass that registry with `--extension-registry` or override a mapping with `--extension-schema NAMESPACE=PATH`. Validation and mutation fail rather than silently accepting an unmapped extension.
- Keep workflow-specific data in namespaced `extensions`; do not add domain fields to the base contract.
- Validate after every manual edit, merge, or state transition.
- Never bypass a rejected dependency cycle, lifecycle transition, missing evidence requirement, or incomplete dependency.
- Update a ready unit to an executable `next_action`; a ready unit must not keep dependency-waiting text.

## Composition boundary

Use this skill only to manage artifacts. Use `$staged-development-orchestrator` to plan or execute substantial staged work and `$resumable-handoff` to create a continuation artifact. Those skills consume this contract but retain ownership of their workflows.

For risky mutation, the work unit records task-level authority and readiness while `safe-change-gate` owns the exact plan, batch approval, operation receipts, omission proof, and rollback. Reference the `safe-change-run@1.0.0` artifact from a work-unit evidence or deliverable location; do not copy its plan, approval, or receipts into the work unit. Work-unit authority never grants safe-change apply approval.

## Required output

Report the artifact path, command run, validation result, selected ready or next unit when requested, and any rejected invariant. Do not claim a state change when the CLI rejected it.
