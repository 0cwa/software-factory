---
name: docx-style-planner
description: Convert raw copy, verified research/compliance profiles, and style intent into a structured DOCX document plan with semantic blocks, document-type necessity rules, forbidden sections, and renderer handoff JSON.
---

# DOCX Style Planner

## Progressive disclosure

- Read `references/planning-checklist.md` when turning substantial source content into sections, resolving structure tradeoffs, or checking handoff completeness.
- Read `references/planner-output-schema.json` before emitting or validating final `document_plan` JSON.
- Require `docx-research-compliance.contract.v1` before final planning for business, legal, tax, invoice, regulatory, or organization-specific documents.
- This skill does not create DOCX files; hand off rendering to `docx-style-renderer` after plan approval.

## Inputs

- Style manifest from `docx-design-stylist`.
- User source content, constraints, and required/forbidden sections.
- `research_profile` from `docx-research-compliance` when applicable.
- Delivery mode and length target.

## Process

1. Classify `document_type` and whether compliance research is required.
2. If research is required but absent, stop and request `docx-research-compliance`; do not invent organization, legal, address, tax, or invoice facts.
3. Copy verified profile fields into the plan: jurisdiction, legal domain, verified organization profile, source URLs, `verified_at`, unsupported claims, and forbidden sections.
4. Build only necessary section blocks. Exclude every `forbidden_sections` item unless the user explicitly overrides with a source-backed reason.
5. For invoices, default to one page and include only required business/invoice content: contractor/client identities, invoice number, invoice date, due date, line items, totals, payment details, currency, and tax fields required by jurisdiction. Do not add a signature line unless allowed by source/user.
6. Assign every section a style token from the style manifest and emit deterministic JSON.

## Canonical section types

Use: `hero`, `section_intro`, `section_body`, `metric_block`, `insight_box`, `callout_box`, `table_block`, `figure_block`, `quote_block`, `invoice_summary`, `invoice_line_items`, `payment_terms`, `tax_summary`, `appendix`.

## Output

Emit `phase="intake"` for open questions and `phase="final"` only when content, compliance, and structure are resolved. Final output must match `references/planner-output-schema.json` and use `handoff.required_contract="docx-style-planner.contract.v2"`.

## Constraints

- Do not invent structure or facts that do not map to user content or verified sources.
- Keep primary sections practical; target 6-20 except short documents like invoices.
- Preserve unsupported claims as unresolved instead of converting them into prose.
- Keep all text directly tied to source intent and document necessity.
