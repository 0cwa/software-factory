---
name: docx-design-stylist
description: Conduct conversational brand design intake, consume verified organization or brand identity profiles when available, translate style intent into concrete DOCX visual decisions, and produce a validated style manifest for downstream generation.
---

# DOCX Design Stylist

## Progressive disclosure

- Read `references/interview-playbook.md` only when the user's style intent is vague, conflicting, or needs structured intake.
- Read `references/taste-to-token-map.md` when converting adjectives, analogies, or brand mood into palette, typography, spacing, and hierarchy tokens.
- Read `references/style-manifest-schema.json` before emitting or validating a final `style_manifest`.
- For business/legal/org-specific documents, consume `docx-research-compliance.contract.v1` before treating organization identity, website, brand assets, addresses, or legal names as facts.
- This skill outputs style intent only; it does not directly edit DOCX content.

## Operating mode

1. Discovery: ask for document type, reader, desired emotion, consumption mode, and brand sources.
2. Compliance intake: if the document names an organization or relies on legal/business identity, require or consume the verified research profile. Do not infer legal entity, address, official website, or brand identity from unsourced copy.
3. Manifest: convert verified identity plus user taste into concrete design tokens.

## Workflow

- Store style axes: `aura`, `rhythm`, `focus`, `contrast`, and `formality`.
- Convert to palette, typography, spacing, hierarchy map, page style, and composition rules.
- If official brand sources are verified, reflect them in `source_backed_brand_identity`; otherwise mark brand identity as unverified and use neutral document styling.
- Preserve accessibility: readable body size, clear emphasis hierarchy, and adequate contrast.
- Present a manifest draft and ask for one-goal approval before final output.

## Output

Final output must be one deterministic JSON object matching `references/style-manifest-schema.json`:

```json
{
  "phase": "final",
  "style_manifest": {
    "version": "1.0",
    "source_backed_brand_identity": {},
    "brand_archetype": {},
    "palette": {},
    "typography": {},
    "spacing": {},
    "hierarchy_map": {},
    "page_style": {},
    "composition_rules": []
  },
  "design_questions": [],
  "design_rationale": [],
  "confidence": "low|medium|high"
}
```

Use `phase="intake"` for follow-up questions and a partial `proposed_manifest`.

## Handoffs

- `docx-style-planner`: consume `style_manifest` plus any verified research profile.
- `docx-style-renderer`: apply manifest constraints exactly.
- `docx-style-linter`: validate style names, hierarchy consistency, and accessibility.
- `docx-critic`: run final polish review.
