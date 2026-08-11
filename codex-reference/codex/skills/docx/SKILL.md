---
name: docx
description: Create, edit, merge, review, or validate DOCX files. Use for any task that reads, writes, restyles, converts, or delivers a .docx, including business, legal, tax, invoice, and organization-specific documents.
---

# DOCX Router

Load exactly the module needed before acting. Modules are internal guides, not separately discoverable skills:

- Create or redesign a document: `modules/workflow-orchestrator/GUIDE.md`; for a narrow stage, use `modules/design-stylist/GUIDE.md`, `modules/style-planner/GUIDE.md`, or `modules/style-renderer/GUIDE.md`.
- Edit an existing DOCX: `modules/editor/GUIDE.md`.
- Combine DOCX files: `modules/composer/GUIDE.md`.
- Validate, polish, or assess output: `modules/style-linter/GUIDE.md` and then `modules/critic/GUIDE.md`.
- Research organization, legal, tax, invoice, regulatory, or jurisdiction facts first: `modules/research-compliance/GUIDE.md`.

## Required gates

- Before styling, planning, rendering, or editing a business, legal, tax, invoice, regulatory, organization-specific, or brand-governed document, load `modules/research-compliance/GUIDE.md`. Do not invent identity, address, tax, legal, or source-backed facts.
- Before a destructive edit to an existing DOCX, identify the target and load `modules/editor/GUIDE.md`.
- For a multi-stage creation, redesign, or delivery workflow, load `modules/workflow-orchestrator/GUIDE.md` and follow its state and approval gates.
- Before final handoff of a generated or materially restyled document, run the lint and critic flow unless the user explicitly requests a draft or skips review.

Keep detailed modules lazy: do not load unrelated guides, references, or scripts.
