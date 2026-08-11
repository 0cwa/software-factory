# Compose Contract

- Inputs must be in render order.
- `base` policy keeps first document styles and maps subsequent styles to base.
- `last` policy gives latest document precedence.
- `strict` policy fails on style collisions and duplicate style IDs.

Preferred command:
`python scripts/compose_docx_parts.py --inputs part1.docx part2.docx part3.docx --output final.docx --policy base --insert-page-breaks --json`

Failure handling:
- If `docxcompose` is missing, fail with remediation.
- Validate each input file exists before compose.
