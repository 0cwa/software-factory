---
name: codebase-hygiene
description: Inventory generated, private, canonical, obsolete, and duplicate repository assets; derive evidence-backed ignore, retain, archive, or removal plans; preview path and reference effects; and apply recoverably when authorized. Use for .gitignore improvement, canonical-file selection, archive cleanup, or repository asset curation. Do not use for ordinary formatting cleanup, provenance or legal audits, dependency upgrades, or deletion without explicit scope.
---

# Codebase Hygiene

Make repository cleanup evidence-driven and recoverable. Read-only inventory is the default.

## Workflow

Read the shared [Development-quality contract](../architecture-friction-audit/references/development-quality-contract.md) and [Asset classification](references/asset-classification.md). Start from the shared [Case Template](../architecture-friction-audit/assets/development-quality-case.template.json) and add [Hygiene Extension](assets/hygiene-extension.template.json).

1. Resolve repository scope, guidance, current worktree state, canonical outputs, build tools, and existing ignore/archive conventions.
2. Inventory tracked and untracked assets. Classify each as canonical source, generated, cache, private/local, duplicate, obsolete, archive candidate, or unknown; record evidence and references.
3. Trace consumers before proposing moves or removal. Derive ignore rules from observed generation behavior, not broad filename guesses.
4. Produce explicit retain, ignore, archive, rename, and remove actions with affected references, recovery method, and omission checks.
5. Preview exact path changes. Use `safe-change-gate` before destructive or broad archive operations, and `provenance-audit-reset` when source origin or clean-room boundaries are the real question.
6. Apply only authorized actions in small batches. Prefer recoverable moves and preserve unrelated user changes.
7. Re-inventory and run focused build or reference checks. Prove canonical assets remain and no unexplained path was omitted.

## Hard gates

- Never infer “obsolete” from age, naming, or lack of recent commits alone.
- Never ignore a path that can contain canonical source or required fixtures without precise evidence.
- Never move or delete files from a preview-only request.
- Never treat cleanup as a provenance or legal guarantee.
- Never clean generated plugin caches as if they were supported source packages.

## Result

Return the artifact inventory, canonical registry, proposed actions and evidence, reference impacts, preview, authority boundary, applied receipts when authorized, post-checks, omissions, and rollback or recovery state.
