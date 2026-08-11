---
name: docx-docx-composer
description: Merge multiple DOCX files into one final artifact with deterministic section order, style precedence, and conflict-aware fallbacks.
---

# DOCX Composer

## Progressive disclosure

- Read `references/compose-contract.md` when merging real DOCX inputs, choosing `base`/`last`/`strict` style precedence, or reporting style conflicts.
- Do not read `references/requirements.txt` unless preparing to run the script or diagnose dependency setup.
- Run `scripts/compose_docx_parts.py` only after input DOCX paths, document order, output path, and style policy are known.
- Do not run the script when the user only needs a merge plan, conflict policy recommendation, or JSON contract shape.

Use this skill when a workflow needs multi-part document assembly.

Inputs:
- ordered list of DOCX files
- optional style policy (`base`, `last`, `strict`)
- optional section map and break rules

Policy:
- `base`: keep base document style set and map incoming docs to base style names.
- `last`: incoming document style precedence wins.
- `strict`: fail on style conflicts.

Execution:
- validate each input is readable
- render in declared order
- optionally inject section/page breaks between documents
- emit merged output and conflict report

Return JSON:

```json
{
  "status": "ok|warning|fail",
  "output_path": "artifacts/final.docx",
  "inputs": ["artifacts/part1.docx", "artifacts/part2.docx"],
  "style_conflicts": [],
  "sections": 0,
  "next": "docx-style-linter"
}
```
