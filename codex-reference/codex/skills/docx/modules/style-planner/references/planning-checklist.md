# Planning Checklist

- Confirm `document_type`, goal, reader, and final action.
- Confirm whether `docx-research-compliance` is required; require it for business/legal/org/tax/invoice facts.
- Confirm verified organization profile: legal entity name, address, jurisdiction, source URLs, and `verified_at`.
- Confirm unsupported claims are not promoted into document content.
- Confirm required sections and forbidden sections.
- For invoices, enforce one-page default unless justified.
- For invoices, include contractor/client identities, invoice number, invoice date, due date, line items, totals, payment details, currency, and required tax fields.
- For invoices, exclude signature lines unless source/user explicitly requires one.
- Validate token map coverage for headings, body, callouts, metrics, tables, invoice fields, appendix, and footnotes.
- Confirm length and density: keep primary sections <= 20; split only oversized tables.
- Ask user for one-goal approval before `phase=final`.
