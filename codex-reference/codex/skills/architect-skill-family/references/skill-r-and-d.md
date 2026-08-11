# Skill R&D and Forward Testing

Use this internal module for a family capability whose domain, product surface, trigger boundary, or acceptance gates need evidence before implementation. Keep `skill-creator` as the owner of individual package construction.

## Research packet

Record only evidence that changes the package:

- the operational failure the skill must prevent;
- representative positive, negative, boundary, and paraphrased requests;
- current authoritative product or domain references, with retrieval dates when freshness matters;
- code or API behavior that instructions must reflect;
- reusable scripts, references, assets, and existing canonical owners;
- unresolved claims and the smallest check that would settle each one.

Prefer primary sources for technical behavior. Separate observed facts, source-backed claims, and design proposals. Do not embed research history in the installed skill; distill durable conclusions into concise instructions or routed references.

## Package decision

Apply the entry-point test in `composition-and-boundaries.md`. Extend or compose an existing owner when intent and deliverable overlap. Internalize helpers that cannot justify an independent request, output, and always-loaded description cost. Keep one-project abstractions in the governed workspace as incubators.

Before editing, freeze the raw trigger cases, golden task, and hard-failure rubric. Do not include the intended architecture or diagnosis in executor-visible fixtures.

## Lightweight construction gates

Run these before broad forward tests:

1. Validate the package with `skill-creator/scripts/quick_validate.py`.
2. Run `inventory_skills.py` on the changed roots; reject missing local links, missing metadata, duplicate names, or an unexplained new entry point.
3. Validate the family registry and routing suite when present.
4. Execute every added deterministic script on a representative success fixture and at least one expected failure.
5. Compare the post-change inventory with the saved baseline and explain every exposed-entry or description-cost delta.

Construction checks establish a prototype, not stable maturity.

## Forward test

Forward-test when behavior is complex, a prototype is being promoted, or weak output has previously passed its gates:

1. Use a fresh agent and temporary fixture copy.
2. Provide only the skill, raw user task, allowed artifacts, and output scope.
3. Keep expected architecture, scoring notes, and earlier outputs undiscoverable.
4. Inspect emitted artifacts and factual behavior against invariants, not preferred wording.
5. Record failed gates and rerun only the smallest targeted case after correction.

Require user approval before a forward test that could be slow, require new authority, or mutate a live system. Never convert a safety failure into a passing average score.

## Result

Leave a compact report naming the research packet, package decision, structural checks, routing results, context delta, forward-test evidence or deferral reason, failed gates, and next promotion action.
