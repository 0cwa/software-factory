# Evidence and recovery rules

Read this only when the handoff source is incomplete, contradictory, security-sensitive, or spread across workspaces.

## Evidence precedence

Prefer, in order:

1. current filesystem, repository, API, or test output;
2. durable artifacts with timestamps or commit identities;
3. a validated work-unit ledger;
4. current-session claims that can still be checked;
5. remembered or inherited narrative, explicitly labeled unverified.

When sources disagree, report the conflict and select a verification action. Do not average them into a synthetic state.

## Resume checks

Choose the shortest read-only checks that can detect drift, such as current working directory, repository status, branch identity, relevant file existence, plan or ledger validation, and the focused test last used as evidence. Include expected observations, not only commands.

Do not include a command that mutates state merely to discover whether the handoff is current.

## Security and authority

Replace secret values with the name of the approved secret source. Distinguish “credential exists” from “credential was tested.” Record denied or expired authority because it changes the next action.

For live or destructive work, the handoff must identify the exact target, last safe snapshot, dry-run evidence when available, rollback condition, and approval still required.

## Multiple workspaces

State the role and verified state of each workspace separately. Record cross-workspace dependency order. Never imply that a commit or test in one repository validates another.
