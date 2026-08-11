# Composition and Boundary Rules

Choose a boundary by user intent, deliverable, authority surface, and evidence—not by persona names or implementation steps.

## Decisions

- **Create:** use when a recurring intent has a distinct deliverable and cannot be expressed cleanly by an existing owner.
- **Extend:** use when intent and deliverable substantially overlap an existing skill.
- **Compose:** use when the outcome is distinct but consumes primitives owned by existing skills.
- **Internalize:** use when a helper has no independent user trigger.
- **Incubate:** use when the abstraction is supported by only one project or its boundary is unsettled.
- **Consolidate:** use when multiple entry points compete for the same intent; choose one owner and migrate consumers.
- **Deprecate:** use after recording a replacement, migration plan, and removal condition.

## Entry-point test

Expose a standalone skill only if all are true:

1. Users can express its intent independently.
2. It produces a distinguishable deliverable.
3. Its trigger can include meaningful negative cases.
4. It owns or composes primitives without duplicating them.
5. Its always-loaded description cost is justified.
6. A realistic golden task can validate it.

Otherwise keep it as a reference, script, contract extension, or project-local incubator.

## Collision rules

- Fail architecture validation when two capabilities claim canonical ownership of the same primitive.
- Flag broad entry skills with substantially overlapping positive triggers.
- Reject circular dependencies in the core family.
- Keep provider commands and domain semantics outside global contracts.
- Treat generated plugin caches as derived artifacts, not source directories.
- Preserve existing domain owners unless evidence shows that their boundary should change.

## Contract evolution

Make additive optional fields in the current major version. For removed, renamed, or semantically changed required fields, create a new major version or provide an explicit compatibility layer. Inventory every consumer, document migration order, retain a deprecation window when practical, and rerun contract and golden-task tests.

## Context budget

Measure description characters or tokens, SKILL.md lines, and the number of exposed entry points before and after a change. Pair compression with trigger regression cases. A smaller description that no longer routes correctly is a regression, not an optimization.
