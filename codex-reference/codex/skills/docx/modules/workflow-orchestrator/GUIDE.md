---
name: docx-workflow-orchestrator
description: Coordinate end-to-end DOCX generation with research/compliance, subagent handoffs, state gates, render/lint/edit/critic loops, and final DOCX handoff.
---

# DOCX Workflow Orchestrator

Use this skill for full DOCX workflows: end-to-end document creation, redesign, refinement, or delivery involving more than one DOCX skill.

For narrow single-skill requests, do not orchestrate. Route directly to the relevant DOCX skill.

## Required reading

- Read `references/orchestration.md` before coordinating a full workflow, recovering from a failed handoff, or deciding whether to loop between research, stylist, planner, renderer, linter, editor, critic, or composer.
- Read `references/workflow-state.md` before creating, updating, validating, or handing off the workflow ledger.
- Read `references/delivery-quality.md` before final delivery, when visual rendering cannot be inspected, or when deciding whether lint and critic evidence is sufficient.
- Use `scripts/workflow_state.py` when a local state file is available and validation is needed.

## Non-negotiable orchestration rules

- Full workflows require subagents when the user explicitly requests subagents, delegation, a forward-test of orchestration, or independent specialist execution. The orchestrator owns sequencing, state, gates, and user checkpoints; subagents own stage execution in that mode.
- Lean workflows are allowed when the user asks for a useful DOCX result and does not require subagents. In lean mode, keep the same stage artifacts and gates, run specialist scripts locally, and record `mode="single_skill"` plus the tool/skill name in each stage result.
- Do not perform downstream specialist work inside the orchestrator prompt when the active mode is `full_workflow`. Spawn the appropriate subagent with the prompt contract in `references/orchestration.md`.
- Add a `research_compliance` stage before design/planning for business, legal, financial, policy, invoice, contract, HR, medical, academic, government, nonprofit, brand-governed, or organization-specific documents.
- Maintain one workflow state JSON ledger. Do not leave orphaned artifacts or reports outside the ledger.
- Canonical stage result statuses are `pending`, `running`, `pass`, `revise`, `reject`, `blocked`, `failed`, and `skipped`.
- Critic decisions must be recorded as `pass`, `revise`, or `reject`; `revise` and `reject` block final completion.
- `status=complete` is invalid unless every required stage has a passing result, required artifacts are registered, no blocking issues remain, and full workflows record subagent execution.

## Default full-workflow stage order

1. `intake`
2. `research_compliance` when required by document type or user constraints
3. `design` via `docx-design-stylist`
4. `plan` via `docx-style-planner`
5. `render` via `docx-style-renderer`
6. `lint` via `docx-style-linter`
7. `edit` via `docx-editor` when lint, critic, compliance, or user review requires changes
8. `compose` via `docx-docx-composer` when multiple DOCX parts must be merged
9. `critique` via `docx-critic`
10. `handoff`

Loop in the smallest stage that can fix the issue. Do not regenerate the full workflow unless a gate proves earlier artifacts are invalid.

## User checkpoints

Pause or summarize for the user at these points:

- after intake if required inputs, audience, jurisdiction, organization rules, or source material are missing
- after `research_compliance` if constraints materially affect content or layout
- after design and plan gates before rendering when the user requested approval checkpoints
- before destructive edits to existing DOCX files
- before final handoff when critic status is not `pass`

## Output shape

```json
{
  "phase": "orchestrated",
  "state": "running|blocked|complete|failed",
  "workflow_state": "artifacts/docx-workflow/workflow-state.json",
  "current_stage": "lint",
  "next_stage": "edit",
  "required_stages": ["intake", "research_compliance", "design", "plan", "render", "lint", "critique", "handoff"],
  "artifacts": {
    "research_compliance_brief": "artifacts/docx-workflow/research-compliance.json",
    "style_manifest": "artifacts/docx-workflow/style-manifest.json",
    "document_plan": "artifacts/docx-workflow/document-plan.json",
    "rendered_docx": "artifacts/docx-workflow/output.docx",
    "lint_report": "artifacts/docx-workflow/lint-report.json",
    "critique_report": "artifacts/docx-workflow/critic-report.json"
  },
  "blockers": [],
  "recommendation": "Proceed only after all required gates pass."
}
```
