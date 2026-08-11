---
name: visual-critique-studio
description: Create meaningfully distinct visual directions, compare them against explicit taste, meaning, accessibility, and usability criteria, iteratively critique, and integrate the selected direction with in-context regression checks. Use for "make several versions," poor-looking diagrams or animations, design critique loops, or choosing among visual variants. Compose with image, Figma, DOCX, diagram, or code-native design skills for rendering. Do not use for a single mechanical image edit, brand asset generation without comparison, or application UX research.
---

# Visual Critique Studio

Produce distinct directions and a defensible selection, not cosmetic copies of one idea.

## Workflow

Read the shared [Content-collaboration contract](../documentation-disclosure-editor/references/content-collaboration-contract.md) and [Comparative critique](references/comparative-critique.md). Start from the shared [Case Template](../documentation-disclosure-editor/assets/content-collaboration-case.template.json) and add [Visual Extension](assets/visual-extension.template.json).

1. Translate feedback into observable criteria: meaning, hierarchy, mood, motion, legibility, accessibility, theme behavior, responsiveness, and technical constraints.
2. Define a few genuinely different direction hypotheses. Vary composition, visual grammar, density, motion, or emphasis—not just color and spacing.
3. Choose the native renderer: `imagegen` for raster imagery, Figma skills for Figma work, DOCX for document rendering, diagram tools for diagrams, or code-native editing for HTML, CSS, SVG, canvas, and animation.
4. Render variants in the realistic context, themes, sizes, and sequence where users will encounter them. Keep comparison conditions consistent.
5. Critique comparatively against the frozen rubric. Record strengths, failures, accessibility issues, lost meaning, and whether each direction is distinct enough to teach anything.
6. Select, combine only compatible strengths, refine the chosen direction, and rerender. Avoid averaging every variant into an incoherent compromise.
7. Regression-check surrounding content, transitions, themes, and functionality. Preserve rejected directions and reasons in the comparison record, not the final asset surface.

## Hard gates

- Never claim multiple directions when variants differ only superficially.
- Never optimize taste while losing semantic accuracy or usability.
- Never critique source code alone when the output can be rendered.
- Never use image generation to replace an established vector, icon, or code-native system without a boundary decision.
- Never mutate a Figma file without loading its required Figma skill prerequisites.

## Result

Return the direction brief, rubric, rendered variants, comparison and critique, selected direction and rationale, refinement changes, in-context regression evidence, rejected directions, limitations, and next iteration.
