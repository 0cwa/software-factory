# Harness Change Manifest

## Candidate identity

- Candidate ID:
- Parent / active digest:
- Issue / PR:
- Author / proposer / provider identity:
- Exact changed surfaces and paths:

## Evidence and hypothesis

- Motivating failure pattern / trace / issue evidence:
- Root-cause hypothesis:
- Why this surface is the narrowest correct target:
- Evidence classification: source fact / experiment / inference / proposal / unknown

## Change

- Workflow graph/node/transition diff:
- Possible-path set diff:
- Authority/effect/workspace diff:
- Prompt/context asset and size diff:
- Provider/model/package/source diff:
- Gate/evaluator/policy interaction:
- Migration and rollback:

## Prediction before evaluation

### Expected fixes

### At-risk regressions

### Expected metric changes

### Conditions where this may not help

## Protected boundary

- Evaluator / held-out task digests:
- Permission / authority policy digest:
- Budget / retention / promotion policy digest:
- Protected surfaces verified unchanged:
- Separate approvals required:

## Evaluation plan

- Held-in suites/tasks:
- Held-out suites/tasks:
- Deterministic hard gates:
- Behavioral objectives:
- Repeat / sampling / cache policy:
- Exact environment/provider identities:
- Resource budgets:

## Result

- Classification: promotable / rejected / inconclusive / blocked / stale / superseded
- Prediction: confirmed / partial / rejected / inconclusive
- Hard-gate outcome:
- Objective tradeoffs / Pareto relation:
- Negative evidence and failure reasons:
- Factory run / Protocol receipt / Foundry evaluation refs:

## Promotion

- Repository draft PR / integration action:
- Foundry proposal / transaction action:
- Required approval digest:
- Post-promotion verification:
- Rollback result or retained prior exact state:
