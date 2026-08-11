# Custom Widget Decision

Use this when a user wants a more visual or app-like Grist experience, or when native Grist appears too constrained.

## Stay Native When

- The workflow is queue/detail, review, triage, intake, dashboarding, or reference lookup.
- Linked tables/cards, filters, display columns, wrapping, Markdown display, choice colors, conditional formatting, forms, charts, or document tours can solve the problem.
- The user mainly needs clearer navigation, fewer visible fields, better grouping, or safer access.
- The widget would only re-skin a native table/card without adding meaningful interaction.

## Prototype A Custom Widget When

- Native linked widgets cannot express the required interaction.
- The user needs a highly tailored reading/review surface, custom comparison view, interactive visualization, print/export layout, guided wizard, or dense domain-specific console.
- The visual acceptance problem is about Grist's native canvas limitations, not just field order or formatting.
- The widget can be read-only or narrowly scoped to specific user-owned fields.

## Required Questions

Before building or recommending a custom widget, answer:

- What exact job does the widget perform?
- Which table(s) and columns does it need?
- Can it use `read table`, or does it need `full` access?
- If it writes, which fields can it write and who authorized that?
- How are columns mapped so renames do not break the widget?
- Where is the widget hosted?
- What third-party libraries or network calls does it use?
- What happens offline, on load failure, or when required mappings are missing?
- How is it tested with viewer/editor/owner roles?
- How is it rolled back to native Grist?

## Safer Defaults

- Prefer read-only or `read table` access.
- Use typed column mappings with friendly titles/descriptions.
- Make writes explicit user actions.
- Write only to user-owned workflow fields.
- Avoid changing source-owned, sync-owned, audit, ACL, sharing, or schema fields from a widget unless the task is explicitly about those controls.
- Keep a native fallback page for the same workflow.

## Deliverable Shape

For a custom-widget proposal, produce:

- Job and audience.
- Native Grist gap.
- Required data and column mappings.
- Access level.
- Write behavior.
- Hosting plan.
- Security and privacy considerations.
- Rollback plan.
- Prototype acceptance checks.
