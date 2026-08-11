# Lint Rules

Inputs are mandatory for package-quality linting:
- rendered `.docx`
- style manifest
- document plan
- renderer report

Style and fallback rules:
- Every token in `manifest.hierarchy_map`, `manifest.page_style`, and every plan `style_token` should be representable as a Word style name or explicitly reported as a renderer fallback.
- Missing required style is fail.
- Renderer `status=fail` is fail.
- Renderer `status=warning`, fallback styles, unresolved style tokens, or render warnings make lint status at least warning.
- Strict unresolved fallbacks are fail.

Required field rules:
- Every document requires a non-empty title and at least one section.
- Invoices require visible invoice identity, recipient/client/customer, date or issue date, and total/amount due cues in either title, section headings, body text, or tables.
- Documents with tables need table headers unless the plan explicitly marks the table as decorative.

Hierarchy rules:
- Heading order should not jump unexpectedly, for example H1 to H3 without H2.
- The rendered document should include at least as many major section headings as planned top-level sections, unless compact invoice mode is active.
- Any final plan with fewer than two sections should raise a warning for editorial density, except one-page invoices.

Spacing and rhythm rules:
- Spacing checks must never be empty placeholders; report pass evidence or concrete warnings in `spacing_summary`.
- Paragraph spacing should not be zero throughout the document.
- Compact invoices should use tighter margins and fewer long paragraphs.
- Dense documents with many paragraphs and no visible heading cadence are warnings.

Accessibility rules:
- Accessibility checks must never be empty placeholders; report pass evidence or concrete warnings in `accessibility_summary`.
- Warn on repeated empty paragraphs used as spacing.
- Warn on all-caps heading overuse.
- Warn on long paragraphs that reduce scanability.
- Warn on tables without header text.

Page-budget rules:
- A low page budget is a hint, not exact page counting. Estimate pressure from paragraphs, tables, rows, and long text.
- Compact invoice target of one page should warn when content density suggests overflow.

Recommended remediation order:
1. Fix plan-required fields and structure.
2. Fix manifest/template style mapping.
3. Regenerate with strict renderer mode.
4. Re-run linter and critic with the new render report.
