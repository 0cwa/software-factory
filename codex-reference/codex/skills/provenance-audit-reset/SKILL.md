---
name: provenance-audit-reset
description: Audit repository or workspace provenance, trace possibly copied material and source references across current files and history, disclose uncertainty, and design a clean-room reset when requested. Use for contamination concerns, source-origin audits, fresh-history planning, removal of source-derived context, or provenance-sensitive rewrites. Operate read-only by default; require explicit destructive authority before deleting files, rewriting history, or replacing a repository. Do not use for ordinary code cleanup, licensing advice alone, or generic Git history editing without a provenance question.
---

# Provenance Audit and Reset

Separate evidence gathering from destructive remediation. Do not make legal, originality, or non-infringement guarantees.

## Audit first

Read [Evidence and reset boundaries](references/evidence-and-reset.md) and start from [Provenance Report Template](assets/provenance-report.template.json).

1. Define the questioned sources, repository or workspace scope, branches and refs, time range, generated and vendored content, and exclusions.
2. Record worktree and repository state before inspecting. Preserve unrelated user changes.
3. Search current files, reachable history, relevant refs, metadata, documentation, comments, assets, and build outputs using read-only methods.
4. Trace each finding to direct evidence. Classify exact copy, transformed copy, reference only, common pattern, independently explained similarity, generated or vendored content, or unresolved.
5. Distinguish absence from incomplete coverage. Report inaccessible refs, missing source material, shallow history, ignored paths, binary limitations, and uncertainty.
6. Produce a provenance report and remediation options before changing anything.

## Reset gate

Compose with `safe-change-gate` for any mutation. A request to audit does not authorize cleanup. Before deleting, rewriting, or replacing history:

- resolve exact paths, refs, repository, remote, and backup target;
- capture a recoverable snapshot outside the destructive target and verify it;
- enumerate retained canonical material and material that must not enter fresh-agent context;
- show the exact deletion, rewrite, or fresh-history plan and irreversible consequences;
- request explicit destructive authority for that scope;
- re-check concurrent editors and target drift immediately before apply.

Prefer a new clean workspace or branch with an auditable import manifest when it better preserves evidence and recoverability than in-place rewriting.

## Verify

After an authorized reset, inspect the resulting files and refs, rerun the scoped searches, verify retained functionality with domain tests, confirm backup readability, and record unresolved findings. Do not delete the audit evidence needed to explain what happened unless separately authorized and legally appropriate.

## Hard gates

- Similarity alone is not proof of copying; absence of a text match is not proof of clean provenance.
- Never expose questioned source material to a fresh implementation agent when clean-room separation is required.
- Never delete backups, reflogs, remotes, source artifacts, or history merely to make the audit appear clean.
- Never present technical screening as legal clearance; recommend qualified review when legal stakes matter.

## Result

Return scope, evidence inventory, finding classifications, coverage gaps, source-exposure boundaries, remediation options, authority state, snapshot and reset plan if requested, verification evidence, unresolved risks, and next action.
