# Renderer Contract

Inputs:
- `plan_json`: output from `docx-style-planner`, either wrapped as `{ "document_plan": ... }` or unwrapped.
- `manifest_json`: output from `docx-design-stylist`, either wrapped as `{ "style_manifest": ... }` or unwrapped.

Script: `scripts/render_docx_from_plan.py`

Call:
`python scripts/render_docx_from_plan.py --plan plan.json --manifest manifest.json --output out.docx --report render-report.json`

Strict call:
`python scripts/render_docx_from_plan.py --plan plan.json --manifest manifest.json --output out.docx --report render-report.json --strict`

Required behavior:
- Preserve section order by `order`.
- Render nested `children` and common block arrays in stable order.
- Apply manifest tokens where feasible with `python-docx`:
  - typography font families and type scale
  - paragraph spacing, line spacing, margins, and alignment
  - palette colors for title, headings, body text, muted text, accents, and table header shading
  - table header/body styling without blindly forcing Word's default Table Grid
  - compact invoice layout hints for one-page or low-page-budget documents
- Keep table row/column count deterministic from `rows`, `cols`, `columns`, `grid`, or `items`.
- For `document_type="invoice"`, use the first-class compact invoice layout path instead of generic sequential rendering. The rendered document must include:
  - one strong invoice header with visible invoice identity and total due
  - a compact metadata strip for invoice number, issue date, due date, and currency
  - supplier/client billing panels
  - styled line-item table with visible headers
  - payment/tax/total block
  - no signature line, acceptance block, testimonial, or marketing filler unless explicitly present in a source-backed plan
- Set output metadata (title, author, subject) for traceability.
- Return a render report with `status`, `warnings`, `errors`, `fallback_styles_used`, and `unresolved_style_tokens`.

Canonical fallbacks:
- `hero` -> `Title`
- `section_intro` -> `Heading 1`
- `section_title` -> `Heading 1`
- `section_body` -> `Normal`
- `metric_block` -> `Heading 2`
- `callout_box` -> `Intense Quote`
- `insight_box` -> `Intense Quote`
- `kpi_callout` -> `Normal`
- `table_block` -> `Normal`
- `figure_block` -> `Normal`
- `quote_block` -> `Intense Quote`
- `appendix` -> `Heading 1`
- `code_snippet` -> `No Spacing`
- `note_box` -> `Intense Quote`
- `invoice_summary` -> `Normal`
- `invoice_line_items` -> `Normal`
- `payment_terms` -> `Normal`
- `tax_summary` -> `Normal`

Invoice layout policy:
- The renderer may infer placeholder values for missing invoice fields, but must not invent real legal, tax, address, payment, or currency facts.
- Keep unresolved invoice facts in bracketed placeholders and preserve source/compliance notes where supplied by the planner.
- A strict invoice render must use non-default table styling, explicit cell padding, visible header shading, and Word heading styles for major sections so linter and critic can detect the intended structure.

Fallback policy:
- Do not create missing styles automatically.
- Non-strict mode: unresolved style tokens are warnings and set `status=warning`.
- Strict mode: unresolved style tokens are errors and set `status=fail`; the document may still be written for visual inspection.
- Missing non-required optional tokens should be warnings, not hidden substitutions.

Failure policy:
- Missing plan/manifest path -> fail fast.
- Invalid JSON -> fail fast.
- Empty or missing document title -> render with metadata fallback, warn, and let the linter decide whether it is blocking for that document type.
- Unsupported image path -> include placeholder text and warning.
- Any strict fallback, unrecoverable render exception, or output write failure -> `status=fail` and non-zero exit.
