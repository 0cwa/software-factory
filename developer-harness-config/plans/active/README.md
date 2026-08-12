# Active Work-Unit Plans

Factory generates one bounded plan projection here (or in the equivalent project `.pi/factory/runtime` reference space) for each active GitHub issue work unit.

Recommended filename:

```text
<owner>-<repository>-issue-<number>.md
```

The generated plan must follow `../../templates/issue-plan.md` and bind exact:

- issue URL/content digest;
- coordinating epic and direct prerequisites;
- repository/base branch/commit;
- Factory workflow/variant/graph;
- Foundry environment receipt;
- developer harness configuration/policy assets;
- candidate branch/worktree and eventual draft PR;
- tests/reviews/evidence/blockers/current phase.

GitHub remains the authoritative backlog and scope. When the issue changes materially, invalidate/rebuild the projection rather than editing around it locally.

Do not store transcripts, full prompts/logs, secrets, raw tool payloads, databases, caches, or whole issue histories here.
