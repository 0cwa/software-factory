# Evidence and Reset Boundaries

Use a defect-first evidence model. Keep questioned source material separate from clean-room implementation contexts when separation is part of the objective.

## Evidence classes

- **Exact copy:** byte-identical or substantively identical material with traceable origin.
- **Transformed copy:** evidence supports a derivation despite mechanical or semantic changes.
- **Reference only:** names, links, citations, or discussion without copied implementation content.
- **Common pattern:** similarity plausibly explained by conventions, interfaces, or standard algorithms.
- **Independent explanation:** contemporaneous artifacts support separate development.
- **Generated or vendored:** origin is external and should be governed by its manifest or license.
- **Unresolved:** evidence is insufficient or contradictory.

Record artifact, location, source candidate, method, observation, classification, confidence, and remediation relevance. Avoid copying unnecessary questioned content into the report.

## Coverage

State which worktree paths, ignored files, refs, commits, reflogs, submodules, archives, binaries, generated outputs, and remotes were inspected. State inaccessible or omitted surfaces. Hash frozen manifests when the audit must be repeatable.

## Clean-room separation

Give implementation agents only requirements and independently derived specifications. Keep source artifacts, matching excerpts, builder diagnoses, prior contaminated outputs, and inherited contaminated context outside their workspace and prompt. Record who had access and when.

When staged delegation carries the boundary, emit `source_exposure.mode: sanitized-spec-only` with a reference to this provenance boundary plus explicit allowed and restricted inputs. Treat the record as binding: orchestration may enforce it but must not broaden it. An agent or workspace already exposed to restricted material is not clean-room and must be recorded as exposed.

## Reset options

Rank options from least destructive: remove current references, replace affected artifacts, create a clean branch, create a fresh repository from an allowlisted manifest, or rewrite history. Explain what each option preserves, exposes, invalidates, and cannot prove.

History rewriting and repository replacement can invalidate hashes, signatures, review links, forks, releases, and collaborator state. Require exact scope, verified backup, explicit destructive authority, and a coordination plan.
