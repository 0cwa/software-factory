---
name: docx-editor
description: Make safe, surgical DOCX edits from user intent while preserving style contracts, verified factual/compliance fields, invoice/legal requirements, and a traceable change log.
---

# DOCX Editor

## Progressive disclosure

- Read `references/edit-guidelines.md` when applying real edits, resolving ambiguous edit intent, or preserving section/style/compliance contracts.
- Do not read `references/requirements.txt` unless preparing to run the script or diagnose dependency setup.
- Run `scripts/edit_docx.py` only when the target DOCX path, edit mode, target text/section, and output or changelog expectations are explicit.
- Do not run the script for proposed edits, review comments, or ambiguous requests; return follow-up questions instead.

## Modes

- `replace_text`: replace exact strings or regex-safe phrases.
- `rewrite_section`: replace the content of a heading section.
- `append`: add a new paragraph/table/callout after a section.
- `style_tune`: adjust style token usage for existing blocks.

## Factual preservation controls

- Preserve verified legal entity names, registered addresses, tax IDs, invoice numbers, invoice dates, due dates, totals, payment details, jurisdiction, and source-backed claims unless the user provides an explicit replacement source or instruction.
- For business/legal/tax/invoice documents, require or preserve the `docx-research-compliance` profile before changing factual fields.
- Never add unsupported claims, marketing sections, acceptance language, or signature lines to invoices unless the plan, user, or source explicitly permits them.
- If an edit conflicts with required fields or forbidden sections, skip it, mark `result="conflict"`, and ask a follow-up question.

## Output

```json
{
  "phase": "final",
  "target_docx": "artifacts/document.docx",
  "edits": [
    {
      "action": "replace_text|rewrite_section|append|style_tune",
      "target": "section_id or heading",
      "before": "old",
      "after": "new",
      "style_token": "section_body",
      "factual_fields_touched": [],
      "source_or_user_basis": "",
      "result": "applied|skipped|conflict"
    }
  ],
  "unsupported_claims": [],
  "changelog": [],
  "status": "ok|warning|fail",
  "handoff": "docx-style-linter"
}
```

If intent is ambiguous, set `status="warning"` and return follow-up questions instead of blind edits.
