---
name: verify-review-findings
description: Verify supplied review findings against current code and intent before editing, classify each as valid, stale, intentional, duplicate, or unclear, fix only confirmed issues, and report dispositions with validation evidence. Use for pasted review feedback, code-review comments, or requests to verify findings before fixing. Compose with GitHub comment skills for PR thread retrieval or mutation. Do not use to perform a fresh broad code review, summarize feedback only, or manage unrelated research.
---

# Verify Review Findings

Treat every supplied finding as a hypothesis. A plausible comment is not proof that the current code is wrong.

## Resolve the review surface

Read [Finding disposition](references/finding-disposition.md) and the shared [Claim-evidence contract](../evidence-decision-research/references/claim-evidence-contract.md). Use [Review Case Template](assets/review-case.template.json) when several findings need a durable audit trail; validate it with `../evidence-decision-research/scripts/validate_claim_evidence.py ARTIFACT`.

Identify the exact repository state, branch or diff, review source, included findings, requested action, and acceptance tests. Preserve unrelated user changes. If GitHub thread state matters, use `github:gh-address-comments` for retrieval; loading this skill does not authorize replies, resolution, reviews, or other remote writes.

## Workflow

1. Normalize each finding into one falsifiable claim with its file, symbol, line anchor, stated impact, and requested change. Deduplicate without losing provenance.
2. Inspect the current code and relevant history, tests, configuration, or compatibility contract. Reproduce behavior when practical.
3. Link direct observations to the claim and search for evidence that contradicts the reviewer’s diagnosis.
4. Disposition every finding as `valid`, `stale`, `intentional`, `duplicate`, or `unclear`; record confidence and why.
5. If fixes were requested, change only valid findings whose intended behavior is clear. Keep each edit traceable to a finding and avoid opportunistic cleanup.
6. Run the smallest relevant checks first, then broader validation only when risk warrants it. Re-read the changed behavior rather than treating a passing command as sufficient proof.
7. Report every finding, including skipped and unresolved ones. Draft explanations for intentional behavior when a code change would be harmful.

## Hard gates

- Never edit merely to satisfy reviewer wording when current behavior disproves or supersedes the finding.
- Never label a finding stale solely because its original line moved.
- Never call behavior intentional without a contract, test, history, user decision, or other evidence.
- Never silently combine multiple findings into one disposition.
- Never resolve or reply to GitHub threads unless the user explicitly authorizes that remote action.
- Stop when a valid finding requires a product or compatibility decision the user has not made.

## Result

Return a disposition table with finding IDs, current evidence, confidence, action, changed files, validation evidence, skipped reasons, unresolved decisions, and any GitHub actions still requiring authority.
