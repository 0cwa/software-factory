# Friction Assessment

Classify an observation only after linking it to delivery or correctness impact.

- Boundary friction: one change must cross unrelated modules or ownership zones.
- Duplication friction: the same policy or behavior must be changed in several places.
- Blast-radius friction: small intent produces a broad or hard-to-review diff.
- State friction: hidden or shared mutable state makes behavior difficult to reproduce.
- Auditability friction: reviewers cannot trace inputs, outputs, or authority.
- Testability friction: behavior cannot be isolated without rebuilding unrelated systems.

File length and style are weak proxies. Record frequency, affected work, failure mode, and the smallest seam that could reduce it. Compare defer, local extraction, and bounded refactor before considering redesign.
