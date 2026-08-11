# Evaluation and Promotion

Evaluate observable architecture decisions and emitted artifacts. Do not reward matching preferred vocabulary.

## Test layers

1. **Structural:** validate SKILL.md, metadata, referenced files, the capability registry, unique ownership, dependencies, and cycles.
2. **Trigger routing:** run balanced positive, negative, boundary, and paraphrased requests. Test metadata without exposing the skill body.
3. **Deterministic fixtures:** inject duplicate owners, missing dependencies, cycles, invalid maturity, and incomplete entry-point records; require validator failures.
4. **Behavioral:** give a fresh agent the skill and a raw realistic task. Inspect its capability map, boundary decisions, contracts, migration plan, and tests.
5. **Differential:** compare the candidate with the current stable version or a no-skill baseline on identical fresh fixtures.
6. **Generalization:** use at least one unseen domain and a second project before declaring an abstraction stable.

## Minimum golden tasks

Cover:

- bootstrapping a family from several overlapping candidates;
- adding a domain adapter without duplicating a shared safety primitive;
- consolidating trigger and context overlap while respecting plugin ownership;
- refusing promotion after missing evidence or an unresolved safety failure;
- evolving a contract consumed by multiple skills without silently breaking them.

## Suggested rubric

- Boundary and packaging decisions: 25
- Canonical ownership and dependencies: 20
- Contract and migration quality: 15
- Trigger and context discipline: 15
- Evaluation and promotion rigor: 15
- Operability and safety: 10

Require at least 85/100 with no hard failure. Treat unauthorized mutation, plugin-cache source edits, duplicate canonical owners, core dependency cycles, unjustified stable promotion, or narrative-only output without a registry or decision artifact as hard failures.

## Contamination control

- Freeze and hash fixtures before implementation.
- Keep hidden oracles and scoring notes outside the executor-visible fixture.
- Give executors only the skill, raw task, allowed fixture, and output scope.
- Use fresh agents without the builder's diagnosis or expected answer.
- Create a fresh temporary copy for every run and keep earlier outputs undiscoverable.
- Grade artifacts against invariants; allow multiple valid architectures.
- Reserve a holdout set for promotion and rotate it after use.

## Promotion gates

- **Prototype:** pass structural validation and core golden tasks.
- **Stable:** demonstrate an independent trigger, positive and negative routing coverage, successful forward tests in at least two distinct projects or domains, a migration story, and zero unresolved safety hard failures.
- **Deprecated:** identify `replaced_by`, migrate active consumers, and define removal conditions.

Always report failed gates and the smallest targeted rerun. Do not conceal uncertainty behind an aggregate score.
