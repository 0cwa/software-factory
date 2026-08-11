# Finding Disposition

Normalize each supplied review item into a claim before deciding whether to edit.

## Required context

Record the finding ID, original wording or a faithful paraphrase, current file and symbol, original anchor when known, alleged impact, requested change, and duplicate provenance. Resolve the current revision before inspecting line numbers.

## Dispositions

- `valid`: current evidence confirms the defect or required change.
- `stale`: the cited condition no longer exists or has already been fixed.
- `intentional`: current behavior conflicts with the comment but is supported by an explicit compatibility, product, or architecture contract.
- `duplicate`: another finding covers the same root condition; retain the source mapping.
- `unclear`: available evidence cannot distinguish valid from invalid without a decision or missing check.

Use `fixed` only after the requested code change and relevant checks pass. Use `fix-recommended` when verification is complete but editing is out of scope. Use `response-drafted` when explanation is the proper outcome. Do not use `skipped` without its disposition and evidence.

## Evidence hierarchy

Prefer current code and reproducible behavior, then tests and explicit contracts, then relevant history and review context. History explains intent but does not override current behavior. A test is evidence only for the behavior it actually asserts.

## Minimal-fix gate

Tie each changed hunk to a valid finding. Preserve public compatibility and unrelated user changes. If the smallest correct fix requires a broader redesign, surface that decision instead of hiding it inside review cleanup.
