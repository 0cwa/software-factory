# Critique Checklist

Required evidence:
- rendered DOCX
- lint report
- style manifest
- document plan if available

Hard gates:
- Reject if lint report is missing.
- Reject if style manifest is missing.
- Reject if linter status is `fail`.
- Revise if linter status is `warning`, even if the document looks acceptable.
- Revise or reject if renderer fallbacks are present and unresolved.

Visual quality checks:
- Readability: paragraph length distribution and scanability.
- Rhythm: spacing and heading cadence across sections.
- Visual hierarchy: token usage and hierarchy consistency.
- Typography: title/body/lead distinctions are visible and not merely default Word styles.
- Palette: manifest colors are visible in headings, tables, callouts, or accents.
- Tables: headers, row density, and body styling support fast scanning.
- Layout: margins, alignment, compactness, and section grouping fit the document type.
- Page budget: compact invoices and other low-page-budget documents should look intentionally compressed, not simply sequential.
- Practicality: suggestions map to concrete renderer, linter, planner, or manifest changes.

Default Word-looking warning signs:
- Mostly Normal paragraphs with little direct formatting.
- Tables that look like unstyled default grids.
- No visible palette usage.
- Weak title/heading/body contrast.
- Sequential paragraphs where the document type needs a compact layout model.

Decision thresholds:
- pass: overall >= 7.25, no major findings, linter `ok`, and no unresolved fallback concerns.
- revise: 4.5 - 7.24, any minor findings, or linter warnings.
- reject: < 4.5, missing required inputs, linter fail, or major conflicts.
