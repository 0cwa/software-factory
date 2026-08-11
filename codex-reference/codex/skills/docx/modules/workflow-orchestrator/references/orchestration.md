# DOCX Orchestration Rules

Use this reference to run a real DOCX workflow. The orchestrator is the conductor, not the specialist, but the workflow can run in either multi-agent or lean single-agent mode.

## Orchestrator responsibilities

- Decide whether the request is a single-skill task or a full workflow.
- Create and maintain the workflow state ledger.
- Decide required stages and gates before work begins.
- Spawn one subagent per specialist stage in full workflows when the user explicitly requests subagents, delegation, a forward-test, or independent specialist execution.
- Use a lean single-agent workflow when the user asks for the document result and does not require subagents. Lean workflows still require the same stage artifacts, gates, reports, and workflow state ledger.
- Pass compact inputs and artifact paths to subagents; do not paste large artifacts unless unavoidable.
- Validate each stage result before allowing the next stage.
- Block completion when required stages, artifacts, or passing decisions are missing.

## Required subagent roles

Full workflows with explicit delegation must use these roles instead of doing the work in the orchestrator context:

- `research_compliance_agent`: gathers factual, legal, business, brand, accessibility, jurisdiction, and organization constraints.
- `design_stylist_agent`: runs `docx-design-stylist` and returns a style manifest.
- `planner_agent`: runs `docx-style-planner` and returns a document plan.
- `renderer_agent`: runs `docx-style-renderer` and returns a DOCX path plus render notes.
- `linter_agent`: runs `docx-style-linter` and returns a lint report with pass/revise/reject implications.
- `editor_agent`: runs `docx-editor` for targeted fixes only when a gate requires changes.
- `composer_agent`: runs `docx-docx-composer` only when multiple DOCX files must be merged.
- `critic_agent`: runs `docx-critic` and returns exactly one decision: `pass`, `revise`, or `reject`.

If no subagent mechanism is available and the user explicitly required subagents or a forward-test, do not silently run a full workflow as one agent. Block and tell the user that full orchestration requires subagent delegation.

## Lean workflow mode

Use lean mode for ordinary DOCX production when fewer agents are desired or the user did not explicitly ask for subagents.

Lean mode requirements:

- Set workflow `mode` to `single_skill`.
- Keep the same canonical stage order and quality gates.
- Run each specialist skill or script locally instead of spawning a subagent.
- Record the executing skill/script name in `stage_results.<stage>.agent`, for example `docx-style-renderer` or `docx-style-linter`.
- Do not mark complete while any required stage is `revise`, `reject`, `blocked`, `failed`, or lint `warning`.
- For invoices, require `research_compliance`, `design`, `plan`, `render`, `lint`, `critique`, and `handoff` unless the user explicitly narrows the request to a single stage.
- Prefer the dedicated renderer invoice layout for `document_type="invoice"`; do not accept generic sequential paragraph output as a final invoice.

## Subagent prompt contract

Every subagent prompt must include:

```text
Role: <role name>
Skill: <required DOCX skill or research/compliance task>
Stage: <canonical stage name>
Workflow state path: <path>
Inputs: <artifact keys and paths required for this stage>
Required output artifact keys: <keys this stage must create or update>
Status vocabulary: pending|running|pass|revise|reject|blocked|failed|skipped
Return JSON only: {"stage":"...","status":"pass|revise|reject|blocked|failed|skipped","summary":"...","artifact_keys":["..."],"issues":[...],"next_actions":[...]}
Constraint: Do not modify artifacts outside the listed inputs/outputs. Do not update unrelated DOCX skill directories.
```

Special contract for `critic_agent`:

```text
Return `status` and `critic_status` as exactly one of `pass`, `revise`, or `reject` unless execution failed. `revise` means targeted changes can likely fix the document. `reject` means the workflow must return to an earlier stage or ask the user for new direction.
```

## Research/compliance stage

Add `research_compliance` before `design` and `plan` when the document is any of these:

- business, invoice, quote, proposal, contract, policy, HR, finance, legal, medical, academic, nonprofit, government, or regulated content
- organization-specific, brand-governed, jurisdiction-specific, fact-sensitive, template-bound, or compliance-sensitive
- based on current facts, prices, dates, laws, standards, product claims, or named organizations

The stage must produce `research_compliance_brief` with:

- source assumptions and facts that need verification
- jurisdiction, business, brand, accessibility, privacy, and retention constraints when applicable
- required disclaimers or prohibited claims
- content risks and reviewer questions
- pass/revise/reject recommendation for proceeding into design and planning

If research cannot be completed with available context, mark the stage `blocked`, not `pass`.

## Stage gates

Do not enter a stage until its prerequisites pass:

- `design`: intake passes, and `research_compliance` passes when required.
- `plan`: `style_manifest` exists and design status is `pass`; `research_compliance_brief` exists when required.
- `render`: `document_plan` and `style_manifest` exist, and plan status is `pass`.
- `lint`: a rendered, edited, or composed DOCX artifact exists.
- `edit`: lint, critic, compliance, or user review produced `revise` with targeted changes.
- `compose`: all input DOCX parts exist and their prior gates pass.
- `critique`: latest candidate DOCX exists and lint has no blocking errors.
- `handoff`: all required stages pass, critic status is `pass`, and final DOCX artifact is registered.

## Status handling

Use the canonical stage statuses below:

- `pending`: stage has not started.
- `running`: subagent is working or expected to work.
- `pass`: stage succeeded and required artifacts are usable.
- `revise`: stage found fixable issues; route to the smallest stage that can fix them.
- `reject`: stage found structural, legal, compliance, or quality failure; return to an earlier stage or ask the user.
- `blocked`: user input or unavailable prerequisite prevents progress.
- `failed`: execution/tool failure, corrupt artifact, or unrecoverable runtime error.
- `skipped`: stage is intentionally not required; do not use for required stages.

Treat `revise`, `reject`, `blocked`, and `failed` as non-complete states. Do not only block on `failed`.

## Completion gate

Before setting workflow `status=complete`, verify all of the following:

- `mode` is `full_workflow` for explicit multi-agent jobs, or `single_skill` for lean workflows.
- `required_stages` accurately lists all required stages.
- every required stage has a result with `status=pass`.
- every required stage result names an executing subagent in `full_workflow`, or an executing skill/script in lean `single_skill` workflows, except `intake` and `handoff`.
- every required artifact key for the required stages exists in `artifacts`.
- `critique` has `critic_status=pass` when critique is required.
- no `error` or `blocker` issues remain unresolved.
- the final DOCX artifact key is registered as `rendered_docx`, `edited_docx`, or `composed_docx`.

Use `scripts/workflow_state.py validate <state>` when available. If validation fails, keep workflow status `blocked` or `in_progress` and report the next required fix.
