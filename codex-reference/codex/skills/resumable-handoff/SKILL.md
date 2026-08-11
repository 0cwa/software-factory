---
name: resumable-handoff
description: Create an executable continuation artifact with verified state, evidence, authority, blockers, resume checks, and one next action. Use for handoffs, compaction, or fresh-agent continuation. Do not use for casual status, ledger maintenance, general documentation, a state-free plan, or continuing implementation.
---

# Resumable Handoff

Produce a continuation artifact that lets a fresh agent act without reconstructing the session from chat.

## Load on demand

- Run `scripts/render_handoff.py` without reading it when a valid work-unit document exists.
- Read [Evidence and recovery rules](references/evidence-and-recovery.md) only when state is incomplete, contradictory, security-sensitive, or derived from several workspaces.
- Use `assets/handoff-extension-v1.schema.json` only when recording structured decisions, authority notes, or resume checks under `extensions["staged-workflows.handoff"]`.
- Use `assets/handoff.template.md` only when changing the rendered format.
- Compose with `$staged-development-orchestrator` only when the request includes execution or multi-stage coordination.

Do not load orchestration guidance for a handoff-only request.

## Resolve the core CLI

Use `$work-unit-core` for direct ledger operations. The renderer locates its CLI from `WORK_UNIT_CORE`, the family source layout, `CODEX_HOME/skills/work-unit-core`, or the legacy `skill-modules` location. If no core is available, stop and report it; do not emit an unvalidated status dump.

## Workflow

1. Inspect current workspace state and distinguish direct evidence from remembered claims. Capture exact branch, diff, files, artifacts, commands, and external state only when verified.
2. Reuse the current work-unit ledger. If none exists, create the smallest valid unit or ledger with the core CLI and encode only the state necessary to resume.
3. Separate completed, active, blocked, proposed, and explicitly omitted work. Preserve unresolved decisions instead of choosing for the user.
4. Put handoff-specific structured state only in `extensions["staged-workflows.handoff"]`; do not create an alternate handoff namespace.
5. Record authority boundaries and the approval state for write, external, live, destructive, commit, and push actions relevant to the next step. In resume checks, use `write` as the projection of the canonical work-unit write dimension; accept `local-write` only as the v1 compatibility alias.
6. Validate the document with `work_unit.py validate`. Correct contract failures before rendering.
7. Render with `scripts/render_handoff.py INPUT`. Use `--output` only when the user requested a file or repository persistence is in scope; otherwise return the rendered artifact in the response.
8. Verify that paths and commands are current, no secrets are embedded, blockers have owners, and the selected next action is executable or names the exact user decision required. Do not label a test command read-only unless its cache and artifact writes are disabled or separately authorized.

## Quality gates

- Never claim completion without acceptance evidence.
- Never use “continue” as the next action without naming what to inspect or run.
- Never expose credentials, tokens, private keys, or unneeded personal data.
- Never turn proposed work into verified current state.
- Include uncertainty and failed commands when they affect resumption.
- Prefer one smallest next action over an unranked backlog.

## Required output

Return a self-contained handoff with objective, verified state, completed and current units, blockers, evidence, authority boundaries, decisions, exact resume checks, and one selected next action.
