---
name: staged-development-orchestrator
description: Orchestrate substantial software work through dependent stages, optional parallel lanes, central integration, and evidence gates. Use to delegate or finish several dependent implementation slices. Do not use for one small self-contained edit, ledger maintenance, or handoff-only or status-only requests.
---

# Staged Development Orchestrator

Turn a substantial objective into bounded work units, execute only ready units, and preserve enough evidence to resume safely.

## Load on demand

Load only the branch needed now:

- Read [Delegation and ownership](references/delegation-and-ownership.md) only when assigning parallel or independent lanes.
- Read [Integration and validation](references/integration-and-validation.md) only when integrating code, designing commits, or choosing validation depth.
- Use `assets/staged-work-extension-v1.schema.json` only when adding orchestration-specific fields to a work unit.
- Compose with `$resumable-handoff` only when the user requests a continuation artifact or the work must cross a context boundary.

Use `$work-unit-core` for direct ledger operations. Do not read its schemas unless a contract field is ambiguous or validation fails.

## Resolve the core CLI

Find the `work-unit-core` skill directory in this order:

1. The `WORK_UNIT_CORE` environment path, when set.
2. `../../modules/work-unit-core` relative to this source skill.
3. `skills/work-unit-core` below `CODEX_HOME`, when installed.
4. `skill-modules/work-unit-core` below `CODEX_HOME`, for legacy module installs.

Stop and report the missing skill if none exists. Do not invent a competing ledger format.

## Workflow

1. Orient from repository guidance, current branch and diff, plans, tests, and verified prior evidence. Preserve unrelated user changes.
2. Record workspace scope and authority before assigning work. Use base authority for write, external, live, destructive, privileged, commit, and push actions. Keep every permission distinct.
3. Decompose the objective into outcome-sized work units. Give each one acceptance gates, deliverables, dependencies, owner, and a concrete next action.
4. Create a ledger with `work_unit.py init-ledger`; create units with `work_unit.py init`; use `work_unit.py update UNIT --work-id ID --patch fields.json` to add dependencies, gates, deliverables, next action, and the `staged-workflows.orchestration` extension atomically; then add units to the ledger and validate it. Read the base unit schema and orchestration extension schema while constructing the patch. In the source family the registry resolves the extension automatically; elsewhere pass `--extension-schema staged-workflows.orchestration=assets/staged-work-extension-v1.schema.json` using a correctly resolved path.
5. Run `work_unit.py ready` and execute only ready units. When a dependency becomes complete, replace any dependency-waiting `next_action` with an executable action before marking or dispatching the unit. Delegate only when lanes are independent, bounded, authorized, and useful. Keep one integration owner.
6. Advance states with `work_unit.py transition`. Never mark `verified` without passed gates and evidence; never mark `complete` without verified or explicitly omitted deliverables.
7. Integrate centrally, validate focused behavior before broader checks, and keep commits scoped when commits are authorized.
8. Re-run ledger validation after replanning or integration. Finish only when the objective is complete, explicitly blocked, or handed off with a concrete next action.

## Replanning rules

- Replan when evidence invalidates a dependency, scope, acceptance gate, or authority assumption.
- Preserve completed evidence; do not reset the whole ledger for one failed unit.
- Never leave a `ready` unit whose next action still says to wait for a completed dependency.
- Serialize overlapping mutation surfaces even when agents are available.
- Bound review loops by acceptance gates and a named stop condition.
- Ask for new authority only when the next ready action actually requires it.

## Required output

Maintain a valid work-unit ledger and report completed units, evidence, blockers, authority still needed, and the smallest next ready unit. A narrative plan without the ledger is incomplete for resumable work.
