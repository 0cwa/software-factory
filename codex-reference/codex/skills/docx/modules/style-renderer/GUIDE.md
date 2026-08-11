---
name: docx-style-renderer
description: Render DOCX files from a DOCX style plan and style manifest, with deterministic style-token mapping and layout constraints.
---

# DOCX Style Renderer

## Progressive disclosure

- Read `references/renderer-contract.md` when rendering a real DOCX, mapping style tokens, handling fallbacks, strict mode, or producing the render report.
- Do not read `references/requirements.txt` unless preparing to run the script or diagnose dependency setup.
- Run `scripts/render_docx_from_plan.py` only when a final `document_plan`, `style_manifest`, output path, and any template path are known.
- Do not run the script for planning, schema discussion, or editorial copy generation; route those to planner/stylist first.

Use this skill for the generation step that writes the actual `.docx`.

Inputs:
- `docx-style-planner` output (`document_plan`)
- `docx-design-stylist` output (`style_manifest`)
- Optional existing template path
- Optional `--strict` flag for package-quality gates

Responsibilities:
1. Resolve semantic style tokens into concrete Word styles without silently creating missing styles.
2. Render sections, nested children, and common structured blocks in deterministic order.
3. Apply manifest typography, palette, spacing, alignment, table, and compact invoice layout tokens where practical in `python-docx`.
4. For `document_type="invoice"`, use the dedicated compact invoice layout model rather than generic sequential paragraphs.
5. Produce output and a render report with `status`, warnings, errors, and fallback details.

Execution contract:
- Prefer `python-docx` for deterministic layout control.
- Use `docxtpl` only when template-bound data substitution is requested.
- Never alter style intent outside requested plan.
- Never create missing style names just to mask a bad manifest/template mismatch.
- In non-strict mode, missing semantic styles render with canonical Word fallbacks and emit warnings.
- In strict mode, missing semantic styles render with canonical Word fallbacks for inspectability but set `status=fail`.

Return format:

```json
{
  "phase": "final",
  "status": "ok|warning|fail",
  "output_path": "artifacts/docx-output.docx",
  "result": {
    "sections_rendered": 0,
    "blocks_rendered": 0,
    "document_type": "general|invoice|...",
    "page_budget": {"target_pages": 1, "compact_layout": false},
    "warnings": [],
    "errors": [],
    "fallback_styles_used": [],
    "unresolved_style_tokens": []
  },
  "handoff": {
    "next_skill": "docx-style-linter",
    "required_checks": [
      "validate_style_presence",
      "render_report_status",
      "fallback_resolution",
      "heading_hierarchy",
      "spacing_checks",
      "accessibility_checks",
      "page_budget_hints"
    ]
  }
}
```

If a required style token is missing in the target document, fall back to a canonical style, emit the fallback in `result.fallback_styles_used`, and add an error when strict mode is active.

Never produce raw editorial copy in this skill. Use this as a technical rendering pass.
