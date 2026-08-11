# Design Heuristics

## Core Principles

- Design for the job, not the table. Start with who needs to decide, edit, review, investigate, or publish.
- Keep one canonical source of truth for each entity. Build multiple views over it instead of duplicating data.
- Separate source, review, computed, sync/audit, and admin fields.
- Make the first page a useful work surface, not raw data.
- Optimize for scanning first and detail second: queue on the left/top, detail on the right/bottom.
- Prefer small filtered work queues over huge "all records" pages.
- Use controlled choices for workflow state, priority, decision, content type, sync status, and exception type.
- Use color as a cue, not as data.
- Give references human display columns. Users should see titles/names, not machine IDs.
- Wrap and render long text where it is read; keep dense grids for short fields.
- Keep formulas and helper fields out of normal user-facing pages unless they are meant to be interpreted.
- Put raw data, sync logs, debug pages, generated pages, and historical/archive pages under an admin area.

## Layout Patterns

### Review Console

Use for editorial review, approvals, QA, and triage.

- Compact queue table: title/name, state, priority, type, signal/metric, recommended action.
- Linked decision card: editable user-owned decision fields.
- Linked notes card: reviewer notes and assessments.
- Linked proposal/diff section: proposed changes beside current source values.
- Linked source snapshot: immutable context styled as read-only/source-owned.

### Spreadsheet Plus

Use when users need a broad table but also selected-row context.

- Wide table on top.
- Linked detail, related rows, summaries, or charts below.
- Keep the table useful when expanded full-screen.

### Summary And Details

Use for month/status/owner/group workflows.

- Summary/group selector.
- Filtered detail rows.
- Optional chart or KPI section.

### Exception Queue

Use for operations and sync health.

- Show only rows needing attention.
- Empty state is acceptable if page title and context make that obvious.
- Nest under admin/operator area unless it is the primary workflow.

### Intake

Use forms when the job is submission, not ongoing review.

- Keep form fields few and named for the submitter.
- Use required fields and controlled options.
- Use hidden/prefilled fields for source or routing metadata.
- Review publishing and permissions before sharing.

## Spreadsheet Research Rules

These rules translate well from spreadsheet research into Grist:

- Keep data rectangular and structured.
- Put one thing in one field.
- Use consistent values and naming.
- Use ISO-like dates when data will be exchanged or analyzed.
- Fill values explicitly instead of relying on blank-neighbor meaning.
- Maintain field descriptions or a data dictionary for non-obvious fields.
- Avoid calculations in raw/source data.
- Avoid formatting as data.
- Use validation/choice fields to prevent entry errors.
- Keep formulas simple and inspectable.
- Keep backups or use document history before risky redesigns.

Research caution: spreadsheet best practices do not guarantee correctness, but they improve maintainability and make later inspection safer. Design should assume errors are possible and make them easier to detect.

## Cross-Tool Patterns

Airtable and NocoDB reinforce useful patterns:

- Views are configured presentations over shared data.
- Different views can have independent filters, sorts, visible fields, and grouping.
- Collaborative/shared views should be stable for teams.
- Personal or locked views prevent accidental disruption.
- Large views benefit from filtering and search rather than loading everything by default.
- Interfaces and dashboards are presentation layers over canonical tables.

## Sources

- https://kbroman.org/dataorg/
- https://arxiv.org/abs/1602.02601
- https://arxiv.org/abs/1211.7104
- https://support.airtable.com/docs/getting-started-with-airtable-views
- https://nocodb.com/docs/product-docs/views
- https://support.microsoft.com/en-US/Excel/get-started/create-and-format-tables
