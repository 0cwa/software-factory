---
name: documentation-disclosure-editor
description: Audit and restructure documentation around reader questions, information hierarchy, diagram jobs, and progressive disclosure; place visuals where they explain relationships, move secondary detail without losing meaning, and verify accuracy plus light and dark rendering. Use for confusing documentation sets, diagram opportunity audits, disclosure design, or docs-wide information architecture. Do not use for one isolated diagram, prose copyediting alone, application UI design, or generic documentation generation.
---

# Documentation Disclosure Editor

Improve how a documentation set teaches, not merely how it looks.

## Workflow

Read [Content-collaboration contract](references/content-collaboration-contract.md) and [Disclosure and diagram rubric](references/disclosure-and-diagrams.md). Create a case from [Case Template](assets/content-collaboration-case.template.json) and validate it with `scripts/validate_content_collaboration.py ARTIFACT` for multi-page work.

1. Inventory documents, navigation, repeated concepts, reader types, and the questions each section should answer.
2. Mark primary, secondary, and reference content. Find missing prerequisites, buried answers, duplication, and sections that mix several explanatory jobs.
3. Register diagram opportunities by job: sequence, relationship, state, hierarchy, comparison, spatial layout, or timeline. Use a specialist diagram or design skill for rendering.
4. Keep essential orientation visible. Move optional examples, edge cases, derivations, and implementation detail into labeled disclosures only when readers can predict their contents.
5. Implement the smallest hierarchy and visual changes that reduce confusion. Preserve anchors, meaning, accessibility, and non-visual explanations.
6. Check every moved or replaced statement for loss and duplication. Render realistic pages in light and dark themes and inspect narrow widths, contrast, overflow, disclosure behavior, and visual accuracy.
7. Report unresolved factual or design choices instead of decorating around them.

## Hard gates

- Never add a diagram without naming the reader question it answers.
- Never hide prerequisites, warnings, decisions, or required steps inside collapsed content.
- Never replace precise prose with a visual that loses exceptions or accessible meaning.
- Never judge visual quality from source alone when rendering is available.
- Use Figma, FigJam, image, DOCX, or code-native skills for their formats; this skill owns information design and QA.

## Result

Return the reader-question map, hierarchy and confusion audit, diagram/disclosure register, edits, preserved and removed duplication, rendering evidence, accessibility checks, unresolved choices, and next improvement.
