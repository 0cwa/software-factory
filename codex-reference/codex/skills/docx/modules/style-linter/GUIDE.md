---
name: docx-style-linter
description: Validate DOCX output against a style manifest, section hierarchy, spacing rules, and accessibility-safe defaults before final handoff.
---

# DOCX Style Linter

## Progressive disclosure

- Read `references/lint-rules.md` when checking a real DOCX or translating warnings into concrete remediation.
- Read `references/lint-report-schema.json` before emitting or validating a machine-consumable lint report.
- Do not read `references/requirements.txt` unless preparing to run the script or diagnose dependency setup.
- Run `scripts/lint_docx_style.py` only when a DOCX path, plan, manifest, and render report are available.
- Do not run the script for high-level QA advice; summarize the applicable rules instead.

Use when a `.docx` has been rendered and needs style, structure, and package-quality checks.

Required inputs:
- Rendered `.docx`
- `style_manifest`
- `document_plan`
- Renderer report from `docx-style-renderer`

Checks:
- Renderer report status and unresolved fallback styles.
- Required document fields for the document type.
- Required style coverage without accepting renderer-created masking.
- Heading hierarchy and section count against the plan.
- Paragraph spacing and section rhythm with non-empty checks.
- Accessibility signals: empty paragraphs, all-caps heading overuse, table header presence, and minimum readable text.
- Page budget hints for compact invoices or other low-page-budget documents.
- Route warnings and failures back to the responsible upstream skill.

Output:

```json
{
  "status": "ok|warning|fail",
  "file": "artifacts/document.docx",
  "required_style_coverage": {
    "required": 0,
    "present": 0,
    "missing": []
  },
  "render_report_status": "ok|warning|fail|missing",
  "fallback_warnings": [],
  "field_errors": [],
  "hierarchy_warnings": [],
  "spacing_warnings": [],
  "accessibility_warnings": [],
  "page_budget_warnings": [],
  "remediation": [
    "Add Missing style: <style_name> in source template",
    "Replace fallback with token-mapped style"
  ],
  "recommend_handoff": "docx-style-renderer|docx-style-planner|docx-critic",
  "recommend_handoff_if_ok": "docx-critic"
}
```

Rules:
- `status=fail` if render status is fail, required styles are missing, required document fields are missing, or strict unresolved fallbacks exist.
- `status=warning` for any non-blocking fallback, spacing, accessibility, hierarchy, page-budget, or render warning.
- `status=ok` only when render report, structure, style checks, spacing checks, and accessibility checks all pass.
- Warnings are not final approval. They must be routed to renderer, planner, or critic with concrete remediation.

Handoff:
- On warning or fail, return to `docx-style-renderer` or `docx-style-planner` with concrete fixes.
- On ok, pass to `docx-critic`.
