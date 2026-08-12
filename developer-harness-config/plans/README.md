# Plans

Plans in this configuration are bounded working projections over authoritative GitHub issues, accepted ADRs, schemas, repository state, and Factory evidence.

They are not a second backlog, issue tracker, environment lock, or workflow engine.

## Files

- `program.md` — the stable cross-repository program map and critical path.
- `active/` — generated per-work-unit plans named from exact repository and issue identity.

## Active plan rules

An active plan must contain:

- exact repository, issue URL/number, issue content digest, base branch/commit;
- coordinating epic and direct prerequisite links;
- selected Factory workflow/variant/graph digest;
- Foundry environment receipt/lock digest;
- developer-config asset/policy digests;
- scope, non-goals, acceptance criteria, and expected checks;
- target modules and implementation sequence;
- risks, unknowns, approvals, and stop conditions;
- current phase, evidence status, blockers, candidate branch/worktree, and draft PR link.

It must not copy:

- full issue histories or entire dependency trees;
- transcripts, raw prompts, full logs, tool payloads, credentials, or runtime databases;
- mutable environment/package state in place of Foundry receipts;
- a changed issue scope that has not been approved in GitHub.

## Synchronization

- GitHub issue state wins when the plan and issue differ.
- Re-fetch and invalidate/replan when issue, prerequisite, base, schema, workflow, policy, or Foundry environment changes materially.
- Factory updates current phase/evidence/blockers and links; it does not rewrite the constitution or issue acceptance criteria.
- A completed plan records the final PR/commit/evaluation refs, then may be archived according to retention policy.

Use `templates/issue-plan.md` as the generated shape.
