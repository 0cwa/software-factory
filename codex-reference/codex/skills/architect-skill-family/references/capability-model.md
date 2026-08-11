# Capability Model

Use a capability registry as the source of truth for a related skill family. Keep the registry in the governed workspace, not in the installed skill.

## Family record

Record:

- `id`: stable hyphen-case identifier.
- `purpose`: outcome the family exists to produce.
- `workspace`: registry and decision-record location.

## Contract record

Record `id`, semantic `version`, canonical `owner`, and `path` relative to that owner's package or source root. A registry may reference a contract owned outside the family, but it must not copy or redefine that contract. Reject two records that claim the same `id@version`, even when their paths or owners differ.

## Capability record

Record:

- `id`, `name`, `version`, and `summary`.
- `operational_failure_prevented`: concrete failure this capability guards against.
- `kind`: `entry-skill`, `internal-module`, `extension`, or `incubator`.
- `maturity`: `incubator`, `prototype`, `stable`, or `deprecated`.
- `location` and `provenance`: personal, plugin, system, or project ownership.
- `canonical_owner_of`: reusable primitives for which this is the sole authority.
- `positive_triggers` and `negative_triggers`.
- `distinct_deliverable`: output that separates it from adjacent capabilities.
- `consumes_contracts` and `emits_contracts`, including versions.
- `depends_on`, `composes_with`, `overlaps`, `supersedes`, and `replaced_by`.
- `authority_class` and `mutation_surface`.
- `context_cost`: exposed status, description size, and SKILL.md size.
- `golden_tasks`, `trigger_tests`, `last_verified`, and `evidence_projects`.
- `promotion_gate`: remaining evidence required for the next maturity level.

Use semantic versions for capability records. When an externally owned installed version cannot be resolved, use a valid sentinel such as `0.0.0+unknown` and record the uncertainty in `promotion_gate` or a decision record; do not put prose into version or numeric context-cost fields.

## Maturity model

- **Incubator:** one-project evidence or unsettled boundary; keep project-local.
- **Prototype:** reusable shape exists and structural checks pass; expect interface changes.
- **Stable:** independent trigger, cross-project evidence, successful raw-task forward tests, and no unresolved safety failure. Apply these promotion gates to locally governed personal and project capabilities. For plugin or system capabilities, record their externally governed maturity and warn when local verification evidence is unavailable rather than pretending to own their promotion.
- **Deprecated:** replacement and migration path are recorded; do not add new consumers.

Do not promote by averaging away a safety failure. Record the failure and require a targeted rerun after correction.

## Canonical ownership

Assign exactly one canonical owner for each reusable primitive, such as authority preflight, finding disposition, handoff rendering, or work-unit lifecycle. Consumers reference the owner through a contract. They may add namespaced domain fields but must not redefine the base semantics.

Use `scripts/validate_registry.py` to detect duplicate owners, unresolved dependencies, dependency cycles, and incomplete exposed entry points.
