# Verification Checklist

Use this after Grist design inspections or writes. Adjust to task scope.

## Before Writes

- Confirm the target document and workspace.
- Read current state, task file, handoff, or owner notes when present.
- Snapshot relevant metadata if making production changes.
- Inspect pages/navigation, sections/widgets, visible fields, filters, sort settings, row counts, and access rules.
- Identify source-owned, user-owned, computed, sync/audit, and hidden/helper fields.
- Confirm whether data-row, schema, ACL, sharing, public-link, automation, or external-system writes are in scope.

## Design Checks

- Primary workflow page is first or obvious.
- Normal users do not start on raw tables.
- Admin/sync/debug/generated pages are hidden, nested, or clearly separated.
- Work queues are filtered to the intended rows.
- Queue columns are few and scannable.
- Detail widgets are linked to the selector.
- Long text is readable with wrapping, Markdown display, card layout, or dedicated detail area.
- References display human names/titles.
- Choice/status fields have controlled options and useful colors.
- Reviewer/user-owned fields are visually distinct from immutable/source fields.
- Formula/helper fields are not visible on front-door pages unless intentionally user-facing.
- Empty exception views are understandable.

## Access Checks

- View as each relevant role when possible.
- Verify editors/reviewers can edit only intended fields.
- Verify viewers/public users cannot edit.
- Verify automation accounts still have intended access.
- Verify formulas, sync/audit tables, credentials, and internal helper surfaces are hidden from users who do not need them.
- If embedding or public links are involved, verify read-only versus editable behavior explicitly.

## Data Safety Checks

- Row counts before/after match expectations.
- Source-owned fields are unchanged unless explicitly authorized.
- No rows were deleted, archived, or marked missing unless explicitly authorized.
- Filters exclude/include the intended records.
- Proposed-change rows, conflict rows, and exception rows still count correctly.
- Formula values and reference display columns still resolve.

## Custom Widget Checks

- Required mappings are present.
- Access level is the least privilege that works.
- Widget handles missing records, empty tables, permission failures, and load errors.
- Write actions are explicit and scoped.
- Native fallback remains available.

## Durable Output

Record:

- What changed.
- What did not change.
- Verification performed.
- Any checks not run and why.
- Remaining risks or blockers.
- Next concrete task or launch decision.
