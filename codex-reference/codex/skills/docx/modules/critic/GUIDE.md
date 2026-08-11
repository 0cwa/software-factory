---
name: docx-critic
description: Evaluate DOCX typography and layout quality, produce taste-aware revision suggestions, and loop with the user until design quality is acceptable.
---

# DOCX Critic

## Progressive disclosure

- Read `references/critique-checklist.md` only when scoring a real DOCX, resolving a borderline pass/revise/reject decision, or producing remediation details.
- Do not read `references/requirements.txt` unless preparing to run the script or diagnose dependency setup.
- Run `scripts/critic_report.py` when a rendered DOCX, lint report, and style manifest are available and the task needs a repeatable critic JSON report.
- Do not run the script for purely conversational design feedback; use the checklist only if the feedback must be mapped to formal criteria.

Use this skill for final polish and taste grading after the renderer and linter have run.

Required inputs:
- rendered DOCX
- lint report
- style manifest
- document plan when available

Output is not blind rewording; it is constrained, design-led feedback:
- hierarchy clarity
- spacing rhythm
- visual hierarchy consistency
- table and layout quality
- document-type fit, especially compact invoices and page-budgeted deliverables
- copy density and readability
- accessibility check signals
- candidate alternatives (Option A/B) if needed

Return format:

```json
{
  "status": "pass|revise|reject",
  "scores": {
    "hierarchy": 0.0,
    "spacing": 0.0,
    "readability": 0.0,
    "typography": 0.0,
    "layout": 0.0,
    "tables": 0.0,
    "document_fit": 0.0,
    "overall": 0.0
  },
  "findings": [
    {
      "type": "major|minor",
      "category": "hierarchy|spacing|aesthetic|accessibility|layout|table|document_fit|lint",
      "message": "",
      "action": ""
    }
  ],
  "options": [
    {
      "label": "Option A",
      "adjustments": [
        "Tighten h1-h2 rhythm by 2 pt",
        "Add one callout to support executive read"
      ]
    }
  ],
  "next": {
    "retry_goal": "If revise, route to docx-style-renderer or docx-style-linter",
    "final_delivery": "If pass, route to export"
  }
}
```

Never return only subjective judgments. Every finding must include an action that can be executed by another agent.

Critic gate:
- Missing lint report or manifest is `reject`.
- Linter `status=fail` is `reject`.
- Linter `status=warning` is at best `revise`, never pass.
- Default Word-looking output, unresolved fallbacks, weak table styling, or ignored page budget must not receive an easy pass.
