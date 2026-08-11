---
name: lean-scope-triage
description: Reduce an overgrown plan to the thinnest complete outcome by scoring user value, agent effort, risk, and reversibility; define an executable thin slice, explicit deferrals, and upgrade seams. Use for 80/20 requests, overcomplicated plans, MVP time-boxing, or "simpler robust way" decisions. Do not use to estimate a settled task, cut mandatory safety or compatibility work, or replace ordinary planning when scope is already lean.
---

# Lean Scope Triage

Optimize for the smallest complete user outcome, not the smallest number of files or steps.

## Workflow

Read the shared [Development-quality contract](../architecture-friction-audit/references/development-quality-contract.md) and [Thin-slice rubric](references/thin-slice-rubric.md). Start with the shared [Case Template](../architecture-friction-audit/assets/development-quality-case.template.json) and add [Thin-Slice Extension](assets/thin-slice-extension.template.json) when a durable plan is useful.

1. Restate the user-visible outcome without inheriting the proposed architecture.
2. Separate mandatory safety, compatibility, data integrity, and acceptance work from optional capability.
3. Generate a few coherent slices, including a no-build or reuse option when plausible. Score user value, effort, risk, reversibility, and learning value.
4. Choose the thinnest slice that is end-to-end usable and testable. Time-box it with explicit stop conditions rather than optimistic precision.
5. Record every deferred capability with its reason and an upgrade seam that avoids premature infrastructure.
6. Check that the slice does not move mandatory work offstage or create an irreversible dead end.
7. Hand dependent implementation to `staged-development-orchestrator` with acceptance gates and deferrals intact.

## Hard gates

- Never cut security, privacy, destructive-change protection, required compatibility, or data-integrity work as “the other 20%.”
- Never call a disconnected demo a complete thin slice.
- Never invent agent-hour precision without repository evidence and bounded assumptions.
- Never preserve speculative extensibility that dominates the current outcome.
- If architecture friction, not scope, is the root cause, use `architecture-friction-audit`.

## Result

Return the restated outcome, scored options, chosen thin slice, mandatory gates, time box and stop condition, explicit deferrals, upgrade seams, rejected complexity, risks, and next executable action.
