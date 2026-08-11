---
name: upstream-fork-maintainer
description: Analyze and soften a maintained fork by mapping its product intent and upstream delta, recovering valuable branch work, classifying upstream changes, preserving explicit compatibility, preferring configuration over duplication, and staging small integrations. Use for upstream comparisons, dangling-branch salvage, rebaseability, or deciding whether upstream commits fit a fork. Do not use for routine git pulls, generic merge-conflict help, publication alone, or replacing the fork's intended product model.
---

# Upstream Fork Maintainer

Reduce accidental fork delta without erasing why the fork exists.

## Workflow

Read the shared [Development-quality contract](../architecture-friction-audit/references/development-quality-contract.md) and [Fork compatibility](references/fork-compatibility.md). Start from the shared [Case Template](../architecture-friction-audit/assets/development-quality-case.template.json) and add [Fork Extension](assets/fork-extension.template.json).

1. Resolve local branch, remotes, upstream reference, dirty state, and authority. Fetch only when external access is authorized; distinguish local evidence from a current remote comparison.
2. State the fork’s product intent, required compatibility, intentional divergence, and desired upstream relationship.
3. Map upstream-only, fork-only, equivalent, conflicting, obsolete, and unknown deltas. Inspect dangling or side branches for unique commits and salvage value.
4. Classify candidate upstream changes by relevance, compatibility, prerequisites, conflict cost, and future mergeability. Prefer configuration, adapters, or isolated patches over duplicated upstream code.
5. Build the smallest ordered integration queue. Separate read-only analysis from local integration and remote publication authority.
6. Integrate one compatible slice at a time when requested. Preserve intentional behavior with explicit gates and validate both fork behavior and future mergeability.
7. Use `staged-development-orchestrator` for multi-slice execution and GitHub skills for PR, checks, push, or publication actions. When provenance review requires clean-room implementation, pass only an independently derived sanitized specification and carry the binding `source_exposure` boundary; never feed branch archaeology, patch excerpts, or inherited diagnoses into that lane.

## Hard gates

- Never assume upstream is automatically correct for the fork’s product model.
- Never call local refs current remote state without an authorized fetch.
- Never discard or rewrite dangling work during read-only archaeology.
- Never hide a replacement or compatibility break as a routine merge.
- Never infer commit, push, PR, or release authority from a comparison request.

## Result

Return fork intent, reference freshness, delta and branch-salvage maps, compatibility decisions, ordered integration queue, preservation and validation gates, unresolved conflicts, authority still needed, and next slice.
