# Context-Budget Audit

Use this internal module to measure installed skill entry points, reduce trigger overlap, or verify that discoverability survives metadata compression.

## Scope and baseline

Inventory every relevant supported source root with `scripts/inventory_skills.py`. Include personal, project, system, and supported plugin source roots that are in scope, but treat generated plugin caches as read-only. Save the unmodified JSON before changing packages.

The inventory reports exact description characters, SKILL.md lines, local links, metadata presence, duplicate names, and entry-point count. Description characters are a deterministic context-cost proxy; do not label them tokens. SKILL.md lines are loaded only after routing and must be reported separately from always-loaded description cost.

## Audit

For each exposed skill, map:

- independent user intent and distinct deliverable;
- canonical owner and composed dependencies;
- positive, negative, boundary, and paraphrased routing cases;
- description characters and SKILL.md lines;
- overlapping entry points and internalizable helpers;
- ownership constraints and supported update path.

Prefer consolidation when entry points compete for the same intent. Prefer internal references or scripts when a helper has no independent deliverable. Never optimize generated plugin caches directly.

## Compare

Create a current inventory and run:

```text
scripts/compare_skill_inventories.py BASELINE CURRENT --output REPORT
```

Use `--fail-on-regression` in deterministic gates. By default, a regression is a new duplicate name, missing root, missing local link, or missing `agents/openai.yaml`. Optional limits can reject unexplained entry-point or description-character growth.

Review added, removed, moved, and changed skills. Explain every entry-point delta and every material description increase. A zero entry-point delta is expected when adding internal modules.

## Routing regression

Start from `assets/routing-regression.template.json`. Preserve frozen prompts across compression attempts and validate the suite with:

```text
scripts/validate_routing_suite.py SUITE --inventory CURRENT
```

The validator checks fixture balance and metadata drift; it does not predict model routing. Run semantic trigger tests against name and description only, without exposing SKILL.md. Reject a compression that worsens required routing even when its character count falls.

## Result

Report baseline and current totals, exact deltas, affected entry points, regressions, routing results, ownership constraints, accepted internalizations or consolidations, and the smallest follow-up test.
