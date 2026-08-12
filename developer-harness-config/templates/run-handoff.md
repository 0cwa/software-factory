# Factory Run Handoff

Use this bounded handoff when a run pauses, transfers to another session/agent, or stops for owner approval. Link artifacts rather than copying transcripts/logs.

## Identity

- Repository / issue:
- Work unit / Factory run:
- Workflow / variant / graph digest:
- Foundry environment receipt / lock:
- Candidate branch / worktree / commit digest:
- Current base / target branch state:

## Current state

- Current phase / executed path / reachable next paths:
- Execution status:
- Acceptance status:
- Active provider/session/capability receipt refs:
- Remaining correction/retry/path bounds:

## Completed work

- Plan/implementation changes:
- Actual changed paths:
- Valid deterministic checks and exact candidate digest:
- Review/security findings and dispositions:
- Artifacts/evidence/Protocol receipt refs:

## Invalid or incomplete evidence

- Stale/invalidated checks:
- Failed gates:
- Unknown/cancelled effect outcomes:
- Incomplete external operations:
- Storage/evidence degradation:

## Blocker or approval

- Exact blocker/decision:
- Why it cannot be safely inferred:
- Relevant issue/ADR/schema/evidence:
- Options and tradeoffs:
- Required approval class / proposal digest:

## Safe next action

One exact action, for example:

- resume a verified phase;
- run named invalidated checks;
- continue the same bounded worker/reviewer session;
- inspect/settle a Protocol receipt;
- approve/apply a Foundry proposal;
- rebase/replan after target change;
- open/update draft PR;
- quarantine/rollback/abandon the candidate.

## Do not do

- do not replay an unknown effect;
- do not broaden permissions or install tools ad hoc;
- do not edit the active tree, protected policy/evaluator, or target branch;
- do not claim acceptance from partial/stale evidence;
- do not duplicate the issue/PR/run or paste sensitive/raw payloads.
