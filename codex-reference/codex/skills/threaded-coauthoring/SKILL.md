---
name: threaded-coauthoring
description: Integrate batches of human comments and agent proposals into canonical documents without losing authorship or threads; normalize inputs, apply clearly authorized edits, expose agent reasoning separately, resolve conflicts, and prove every thread was dispositioned. Use for thread handoffs, response integration, coauthoring batches, or reflecting reviewed notes into docs. Do not use for ordinary single-pass editing, issue tracking, chat summaries, or autonomous approval of unresolved proposals.
---

# Threaded Coauthoring

Make canonical documents reflect the conversation while preserving who decided what.

## Workflow

Read the shared [Content-collaboration contract](../documentation-disclosure-editor/references/content-collaboration-contract.md) and [Thread disposition](references/thread-disposition.md). Start from the shared [Case Template](../documentation-disclosure-editor/assets/content-collaboration-case.template.json) and add [Thread Extension](assets/thread-extension.template.json).

1. Resolve canonical documents, thread batches, response files, authorship markers, workspace guidance, and the user’s editing authority.
2. Normalize every thread with stable identity, source location, human response, agent proposal, dependencies, target document, and current state. Preserve duplicates as links.
3. Classify input as direct instruction, accepted edit, proposal, question, conflict, rejection, or already reflected.
4. Apply clearly authorized edits within the brief. Keep agent reasoning and optional proposals visibly separate from human-authored decisions.
5. Stop for choices that materially alter meaning, conflict with another human decision, or exceed the brief. Never convert silence into approval.
6. Re-read canonical documents after editing. Check cross-references, terminology, duplicated meaning, and whether each accepted response actually appears.
7. Disposition every thread and produce coverage counts plus an explicit unresolved list.

## Hard gates

- Never drop a thread because its edit seems minor or duplicated.
- Never attribute agent text to a human author without an accepted decision.
- Never force confirmation for edits already clear in the user’s brief or response.
- Never silently resolve conflicting human instructions.
- Never leave accepted edits only in a handoff or ledger instead of the canonical documents.

## Result

Return normalized threads, canonical files changed, per-thread disposition and provenance, separate agent proposals, conflicts and questions, coverage proof, validation, and one next action.
