---
name: grist-design
description: "Use to design, review, or improve Grist documents and relational spreadsheet workflows, pages, widgets, and usability."
---

# Grist Design

## Operating Stance

Treat a Grist document as a small app built from relational tables, pages, widgets, formulas, formatting, access rules, and navigation. Design for the person doing the work first, then for maintainers and automation.

Start read-only. Inspect the current document, task scope, user roles, table model, pages, filters, visible fields, formulas, access rules, and recent durable state before proposing or writing layout changes. For production documents, do not change data rows, permissions, sharing, automations, webhooks, source-owned fields, or external systems unless explicitly authorized.

Use native Grist first. Prefer pages, nested navigation, linked table/card widgets, filtered views, display columns, choice colors, row/cell conditional formatting, wrapping, Markdown display, forms, charts, document tours, and access rules before custom code.

Use custom widgets only as a separate design decision. Before recommending or building one, define its access level, hosting, column mapping, read/write behavior, security boundary, rollback path, and why native Grist cannot meet the need.

## Experience Quality

Design for workflow rhythm, not widget count. A good review surface should feel like a guided sequence: select an item, understand the source context, make the decision, propose changes when needed, and leave rationale. Avoid splitting that flow into too many equal-weight widgets or cards; more sections can make the page feel busier while making the work less clear.

Use color as a system, not decoration. Choose a small harmonious palette with distinct roles for editable/action fields, status or priority, proposal/change fields, immutable source context, and exceptions. Use saturation and contrast to direct attention. Do not answer "make it more colorful" by coloring every surface equally.

Make hierarchy stronger than labels. Section names should match the actual interaction quality. Avoid playful or grand labels when the underlying Grist widget still behaves like a plain table or card; honest labels beat cute labels that make the interface feel performative.

Design comparisons, not just fields. For proposal workflows, reviewers need obvious current-vs-proposed context: what is locked source truth, what is editable proposal, and what consequence the proposal has. Reference fields should use human display columns, and parent/relationship fields should never expose raw row IDs as the normal reviewer experience.

Recognize the native Grist ceiling. If several rounds of native pages, linked widgets, formatting, and display metadata still cannot create a cohesive human workflow, stop recommending incremental Grist-native tweaks and propose a custom-widget prototype plan with the required safety decisions.

## Workflow

1. Identify the audience and jobs to be done.
   Separate reviewers, operators, owners/admins, automation accounts, external submitters, and public viewers.
2. Map the data ownership model.
   Distinguish source-owned fields, user-owned review/action fields, computed/formula fields, sync/audit fields, and hidden helper fields.
3. Design navigation before widgets.
   Put the primary human workflow first. Nest or hide raw, sync, debug, generated, historical, and admin pages unless normal users need them.
4. Choose the native layout pattern.
   Use a queue/detail console, spreadsheet-plus, summary/details, chart dashboard, calendar, form intake, or read-only embed depending on the job.
5. Make fields readable and safe.
   Use human display columns for references, wrap long text, use Markdown display where helpful, group fields by action/context/source, style status/ownership cues consistently, and keep color harmony across the whole document.
6. Verify behavior after changes.
   Check row counts, filters, linked sections, visible fields, formulas hidden from user-facing surfaces, access behavior, and unchanged source data.
7. Write durable state.
   Record what changed, what was intentionally not changed, remaining risks/blockers, and the next concrete task.

## References

Read only what the task needs:

- [Grist Feature Map](references/grist-feature-map.md): current Grist design surfaces, widgets, access, embedding, forms, tours, and custom widgets.
- [Design Heuristics](references/design-heuristics.md): practical spreadsheet/app patterns and research-backed usability rules.
- [Custom Widget Decision](references/custom-widget-decision.md): when to stay native, when to prototype a widget, and required safety questions.
- [Verification Checklist](references/verification-checklist.md): read-only and post-write checks for Grist UI/design work.

## Default Patterns

For review or approval workflows, default to a compact queue table linked to one or more card/detail zones. Keep the queue dense and scannable; put long text, notes, proposal fields, and immutable source context in linked detail widgets. Keep the detail area organized around the reviewer's mental flow rather than implementation categories, and avoid adding so many linked zones that the page becomes a fragmented dashboard.

For operations/admin workflows, separate exception queues from raw diagnostics. Empty exception views are useful if their purpose is clear and they are not the first surface normal users see.

For public or external intake, prefer forms or read-only embeds over exposing the full document. Review sharing and access rules before publishing links.

For dashboards, include the underlying filtered table near charts when users need traceability. Do not make charts the only way to inspect operational data.

## Red Flags

Stop and report risk when a design requires:

- Editors to see formulas, API keys, sync internals, or raw automation tables they do not need.
- Color, font style, row position, or hidden fields as the only source of workflow state.
- Color that is loud but not meaningful, inconsistent palettes, or equal visual weight for primary actions and passive source context.
- Labels that promise an app-like experience while the underlying interaction remains a plain spreadsheet.
- Custom widgets with full document access without explicit authorization.
- Layout-only changes that silently change filters, row eligibility, formulas, ACLs, public links, or data rows.
- A reviewer/operator first page that is just a raw table dump.
