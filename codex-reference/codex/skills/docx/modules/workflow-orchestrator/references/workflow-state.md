# DOCX Workflow State Contract

Maintain one small JSON state file per workflow run. It is an orchestration ledger, not the style manifest, document plan, or report body.

## Required top-level fields

- `workflow_id`: Stable identifier for this run.
- `created_at`: ISO-8601 timestamp for initial state creation.
- `updated_at`: ISO-8601 timestamp for last state update.
- `mode`: `single_skill` or `full_workflow`.
- `status`: `draft`, `in_progress`, `blocked`, `failed`, or `complete`.
- `current_stage`: Current canonical stage.
- `required_stages`: Stages that must pass before completion.
- `artifacts`: Object mapping semantic artifact keys to paths.
- `stage_results`: Object mapping stage names to compact result objects.
- `issues`: Array of issue objects.
- `next_actions`: Short actionable next steps.

## Canonical stages

- `intake`
- `research_compliance`
- `design`
- `plan`
- `render`
- `lint`
- `edit`
- `compose`
- `critique`
- `handoff`

## Artifact keys

Use stable semantic keys:

- `source_copy`
- `research_compliance_brief`
- `style_manifest`
- `document_plan`
- `rendered_docx`
- `lint_report`
- `edited_docx`
- `composed_docx`
- `critique_report`
- `handoff_note`

## Stage result shape

```json
{
  "status": "pass",
  "summary": "Rendered DOCX from approved plan and style manifest.",
  "agent": "renderer_agent",
  "artifact_keys": ["rendered_docx"],
  "completed_at": "2026-06-30T12:00:00Z"
}
```

Allowed stage result statuses: `pending`, `running`, `pass`, `revise`, `reject`, `blocked`, `failed`, `skipped`.

Critique results must include `critic_status` when the `critique` stage runs:

```json
{
  "status": "revise",
  "critic_status": "revise",
  "summary": "Document is close but invoice payment terms conflict with the compliance brief.",
  "agent": "critic_agent",
  "artifact_keys": ["critique_report"]
}
```

## Issue shape

```json
{
  "severity": "blocker",
  "stage": "research_compliance",
  "message": "Invoice jurisdiction is unknown; tax language cannot be validated.",
  "artifact_key": "research_compliance_brief"
}
```

Allowed severities: `info`, `warning`, `error`, `blocker`.

## Completion rules

`status=complete` is valid only when:

- every `required_stages` entry has a stage result with `status=pass`.
- required artifacts for those stages exist in `artifacts`.
- full workflows record a subagent in `agent` for every required specialist stage except `intake` and `handoff`.
- lean `single_skill` workflows should still record the executing skill or script in `agent`, for example `docx-style-renderer`, `docx-style-linter`, or `custom-docx-renderer`.
- required critique has `critic_status=pass`.
- no issue has severity `error` or `blocker`.
- at least one final DOCX artifact is registered as `rendered_docx`, `edited_docx`, or `composed_docx`.

`revise`, `reject`, `blocked`, and `failed` all prevent completion.

## Practical rules

- Keep paths as strings; do not embed large artifacts.
- Append summaries and artifact keys, not full reports.
- Set `status=blocked` when user input or missing context is required.
- Set `status=failed` only for execution failures that cannot be recovered by another stage.
- Prefer `next_actions` over long prose when handing state between agents.
- Validate state before handoff when the helper script is available.
