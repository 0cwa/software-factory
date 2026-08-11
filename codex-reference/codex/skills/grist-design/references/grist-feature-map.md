# Grist Feature Map

Use this as a compact map of Grist design capabilities. Verify against current Grist docs when exact product behavior matters.

## Document Structure

- A document contains tables, pages, and widgets. A page can show multiple widgets over the same or related tables.
- Pages are part of the UX. They can be renamed, reordered, nested, collapsed by default, duplicated, and removed without necessarily deleting underlying data.
- Use top-level pages for primary workflows. Nest admin, sync, raw, generated, debug, and historical pages away from normal users.

## Native Widgets

- Table: dense scanning and bulk review.
- Card: one selected record in a form-like layout.
- Card list: multiple records with card layout.
- Form: external or internal intake into a table; supports custom titles, required fields, hidden fields, URL prefill, Markdown header/paragraph blocks, success text, redirects, preview, publish, and unpublish.
- Chart: built-in charting; can be linked to selectors.
- Calendar: date-oriented work.
- Custom: HTML/CSS/JS widget, including premade widgets such as advanced charts, map, Markdown, notepad, image viewer, copy-to-clipboard, and others.

## Layouts And Linking

- Linked widgets are the strongest native app pattern.
- Same-record linking: table queue selects a card/detail widget for the same row.
- Reference/filter linking: a selector table filters related records through reference columns.
- Summary-table linking: grouped summaries select filtered detail rows.
- Dynamic chart linking: a selected row or group controls chart data.
- Place selector widgets left of or above dependent widgets.
- Keep layouts simple. Complex multi-widget pages can be powerful but are easy to make visually brittle.

## Formatting

- Conditional formatting is formula-driven and can apply to rows or cells.
- Later conditional-formatting rules override earlier rules.
- Use formatting for semantic reinforcement: state, priority, ownership, warning, locked/source context.
- Do not use color or formatting as the only stored state.
- For readability, use wrapping, appropriate display widgets, and human reference display columns.

## Access And Sharing

- Team/document roles are Viewer, Editor, and Owner.
- Without access rules, Editors can change data, structure, formulas, and layout.
- With access rules enabled, Owners can restrict structure/formula changes and define granular table, column, and row permissions.
- Treat access rules as part of app design, not only security.
- Use `View As` or equivalent role checks when possible.
- Embedding requires public access. `?embed=true` is read-only and chrome-free; `?style=singlePage` can be editable and follows access rules.

## Custom Widgets

- Require web development and hosting at a reachable URL.
- Can request `none`, `read table`, or `full` access.
- Can use `onRecord`, `onRecords`, and option APIs.
- Can define typed column mappings so widgets survive column renames and can be reused.
- Can store options and participate in linking with `allowSelectBy`.
- Full-access custom widgets can modify the document. Treat them as privileged software.

## Onboarding

- Document tours are a beta feature driven by a hidden `GristDocTour` table.
- Tours can add tooltips to pages or cells and are useful for complex workflows after the core design is stable.

## 2026 Notes

As of the May 2026 Grist newsletter:

- Grid/table views had new screen-reader support.
- Row and column menus had keyboard shortcuts.
- The widget picker had keyboard and screen-reader support.
- Self-hosted custom CSS could be injected into widgets.
- Grist's community was actively exploring AI-assisted custom data interfaces and custom-widget builder workflows.

## Sources

- https://support.getgrist.com/page-widgets/
- https://support.getgrist.com/custom-layouts/
- https://support.getgrist.com/linking-widgets/
- https://support.getgrist.com/widget-custom/
- https://support.getgrist.com/conditional-formatting/
- https://support.getgrist.com/widget-form/
- https://support.getgrist.com/teams/
- https://support.getgrist.com/team-sharing/
- https://support.getgrist.com/access-rules/
- https://support.getgrist.com/document-tours/
- https://support.getgrist.com/embedding/
- https://support.getgrist.com/newsletters/2026-05/
