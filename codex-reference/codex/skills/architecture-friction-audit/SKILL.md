---
name: architecture-friction-audit
description: Detect evidence-backed architectural friction encountered during feature work—godfiles, duplicated logic, broad blast radius, unclear ownership, or poor auditability—and produce a narrowly scoped refactor decision with behavior-preservation gates. Use when architecture is slowing or destabilizing work, or to assess a specific godfile or mudball concern. Do not use for scheduled cleanup without observed friction, general code review, broad rewrites, or style-only refactoring.
---

# Architecture Friction Audit

Treat architecture work as a response to observed delivery friction, not a periodic ritual.

## Build the case

Read [Development-quality contract](references/development-quality-contract.md). Create a `development-quality-case@1.0.0` from [Case Template](assets/development-quality-case.template.json) and validate it with `scripts/validate_development_quality.py ARTIFACT` when the decision affects multiple files or future work.

1. Capture the blocked command, risky diff, repeated defect, ownership ambiguity, duplicated change, or auditability gap. Link concrete evidence and identify recurrence.
2. Classify the friction using [Friction assessment](references/friction-assessment.md). Distinguish structural causes from missing tests, unclear requirements, or one-off mistakes.
3. Estimate blast radius across files, interfaces, data, users, compatibility, and unknowns.
4. Compare at least `defer`, a tiny extraction or boundary, and a larger local refactor when each is plausible. Score value, effort, risk, reversibility, and tradeoffs.
5. Recommend the smallest option that removes the observed friction. Replan staged work only when the evidence changes dependencies or ownership.
6. Define behavior-preservation gates before implementation. Keep architecture changes separate from unrelated feature changes when possible.
7. Validate focused behavior first, then broader compatibility proportional to blast radius.

## Hard gates

- Do not infer a refactor trigger from file length alone.
- Do not use “clean architecture” as a substitute for a measurable delivery or correctness benefit.
- Do not hide product, compatibility, or data-migration decisions inside a refactor.
- Do not expand into a repository rewrite when a local seam resolves the friction.
- Use `staged-development-orchestrator` for dependent execution and `verify-review-findings` for supplied review claims.

## Result

Return the observed friction and evidence, cause classification, option matrix, blast radius, selected action or explicit deferral, preservation and validation gates, affected work units, and one next action.
