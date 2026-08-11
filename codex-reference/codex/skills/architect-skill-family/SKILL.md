---
name: architect-skill-family
description: Design and govern cohesive families of Codex skills and workflows. Use when adding, restructuring, consolidating, or evaluating multiple related skills; deciding whether a capability should be created, extended, composed, internalized, or incubated; defining shared contracts and ownership; controlling trigger overlap and context cost; or establishing cross-skill validation, forward-testing, migration, and promotion gates. Do not use for a single straightforward skill with no ecosystem or overlap question.
---

# Architect Skill Family

Create a small, interoperable skill family with explicit ownership, contracts, boundaries, and evidence. Keep this skill focused on ecosystem architecture; use `skill-creator` to scaffold or edit each individual skill.

## Operating rules

- Give every reusable primitive exactly one canonical owner.
- Expose a skill only when it has a distinct user intent and deliverable. Keep helpers without independent triggers as references, scripts, or internal modules.
- Prefer extending when intent and output overlap, composing when outcomes differ but share primitives, and incubating project-locally until a second project validates the abstraction.
- Keep real registries and decision records in the governed workspace. Copy templates from `assets/`; never turn this installed skill into a mutable project database.
- Treat plugin caches and vendor-owned skills as read-only. Change their source package through its supported development flow or compose around them.
- Version shared contracts. Require a migration decision before making an incompatible change.
- Measure discoverability and context cost together; shortening descriptions must not erase positive triggers or important negative boundaries.

## Internal modules

- Read [Skill R&D and forward testing](references/skill-r-and-d.md) when a family capability needs current domain research, a new package, stronger creation gates, or a contamination-controlled forward test. Continue to use `skill-creator` for the individual skill.
- Read [Context-budget audit](references/context-budget-audit.md) before adding or removing exposed entry points, compressing descriptions, changing router boundaries, or comparing installed layouts.
- Use `scripts/compare_skill_inventories.py BASELINE CURRENT` to measure exact entry-point and description-character deltas. Treat characters as a deterministic proxy, not a tokenizer result.
- Use `scripts/validate_routing_suite.py SUITE [--inventory INVENTORY]` to validate balanced metadata-routing fixtures before semantic routing tests.

## Workflow

### 1. Frame the family

Collect concrete requests that should and should not trigger the family. Identify the operational failures the proposed capabilities prevent. Inventory existing personal, project, system, and plugin-owned skills before proposing new ones.

Run `scripts/inventory_skills.py` against the relevant skill roots when a deterministic inventory is useful. Do not infer authorization to modify anything the inventory finds.

### 2. Map capabilities and ownership

Decompose requested outcomes into user-facing intents, deliverables, and reusable primitives. Assign one canonical owner to each primitive and classify every candidate as `entry-skill`, `internal-module`, `extension`, or `incubator`.

Read [Capability Model](references/capability-model.md) for the required registry fields and maturity model. Start from [Capability Registry Template](assets/capability-registry.template.json) when the family needs durable governance.

### 3. Decide boundaries

For each candidate, choose `create`, `extend`, `compose`, `internalize`, `incubate`, `consolidate`, or `deprecate`. Record the distinct intent, distinct deliverable, owner, dependencies, authority surface, overlap, and negative triggers. Use the [Decision Record Template](assets/decision-record.template.md) for consequential splits, consolidations, or contract changes.

Read [Composition and Boundary Rules](references/composition-and-boundaries.md) before splitting or consolidating skills. Default to fewer exposed entry points when the evidence is ambiguous.

### 4. Define shared contracts

Define the smallest stable base contract shared by multiple workflows. Add namespaced extensions rather than growing one universal schema. For staged development families, consume the canonical [Work Unit Contract](../work-unit-core/contracts/work-unit-v1.schema.json) owned by `work-unit-core`; reference it from the governed registry and never copy it into the family package.

Keep domain commands, provider semantics, and project-specific states in adapters. The base contract should carry only cross-cutting identity, scope, authority, lifecycle, acceptance, evidence, blockers, deliverables, and next action.

### 5. Plan and implement the package

Order work from contracts and internal modules to entry skills and adapters. For every individual skill:

1. Load and follow `skill-creator`.
2. Keep `SKILL.md` concise and route optional detail to one-level-deep references.
3. Add scripts only for repeated deterministic work and test them directly.
4. Generate matching `agents/openai.yaml` metadata.
5. Avoid hard-coded model names, mandatory delegation, or domain behavior in the shared core.

### 6. Audit and validate

Run `scripts/validate_registry.py <registry.json>` and resolve ownership conflicts, missing dependencies, cycles, invalid records, and incomplete trigger tests. Do not call a machine-readable artifact complete until it passes; label unresolved external metadata explicitly instead of inserting prose placeholders into typed fields.

Read [Evaluation and Promotion](references/evaluation-and-promotion.md). Create positive and negative trigger cases, at least one golden task, a failure rubric, and an explicit context-budget delta. Use [Evaluation Suite Template](assets/evaluation-suite.template.json).

For router changes, start from [Routing Regression Template](assets/routing-regression.template.json), validate it structurally, then run it against metadata without exposing the skill body.

Forward-test complex skills in fresh agents using the skill and a realistic raw task. Do not reveal the expected architecture or prior diagnosis. Inspect emitted artifacts and factual behavior, revise the skill, and repeat when gates fail.

### 7. Promote or migrate

Promote only when the candidate passes structural validation, trigger tests, its golden task, and the family registry checks. For consolidation, record `supersedes` and `replaced_by`, migrate callers, and avoid leaving competing exposed aliases indefinitely.

## Required handoff

Leave the governed workspace with:

- a capability map and canonical-owner assignments;
- explicit create/extend/compose/internalize/incubate decisions;
- versioned contract references;
- a dependency-aware build order;
- trigger, golden-task, and failure-rubric coverage;
- unresolved authority or ownership decisions;
- the smallest actionable next step.

Do not present an unranked list of possible skills as a finished architecture.
