# Architecture and ownership

## Target shape

```text
pi-coding-agent host
  |
  | explicit workflow invocation and host-minted authority
  v
pi-dev workflow layer
  | owns work units, phases, gates, evidence, workspace policy, correction
  | invokes generated targets through Pi Protocol
  v
pi-pe pipeline provides
  | owns fixed ordering, mappings, limits, fingerprints, pipeline traces
  v
pi-protocol fabric
  | owns invocation, grants, sessions, receipts, causal provenance
  v
pi-dev role and adapter provides
  | scout | architect | worker | reviewer | security_reviewer | deterministic adapters
```

Pi-PE and Pi-Dev both depend on Pi Protocol. Pi-PE must never depend on Pi-Dev. The Pi-Dev workflow layer should invoke Pi-PE management and generated provides through protocol targets rather than importing Pi-PE internals.

## Canonical ownership

| Concern | Owner | Boundary |
|---|---|---|
| Public capability contracts and discovery | Pi Protocol | Pipelines and workflows appear as normal provides. |
| Principals, grants, confirmation, and invocation authority | Pi Protocol plus host | Neither Pi-PE nor a pipeline spec may widen authority. |
| Agent profiles, role prompts, tools, and role output contracts | Pi-Dev | Roles remain independently callable. |
| Fixed pipeline graph, value mapping, limits, and dependency drift | Pi-PE | Pi-Dev must not implement a second linear pipeline executor. |
| Pipeline-definition persistence and registration reconciliation | Pi-PE | This store must not become the development run store. |
| Development work-unit and phase lifecycle | Pi-Dev workflow layer | These are domain semantics, not pipeline DSL fields. |
| Acceptance gates and evidence references | Pi-Dev workflow layer | Pipeline success means all steps returned successfully; it does not mean the development result is accepted. |
| Same-session correction and bounded repair | Pi-Dev workflow layer using Pi Protocol sessions | Pi-PE keeps zero automatic retries. |
| Workspace mutation policy | Host and Pi-Dev workflow layer | Downstream role restrictions remain authoritative; pipeline data is not a sandbox. |
| Invocation receipts and causal provenance | Pi Protocol | Pi-PE may project receipt references into traces but must not create a competing ledger. |
| Durable development run state | Pi-Dev workflow layer | Persist phase outcomes, gate reports, receipt references, blockers, and next action. |

## Non-negotiable invariants

1. Pi-PE remains data-only: no JavaScript, shell, templates, expressions, or input-selected targets in pipeline definitions.
2. Pi-PE remains fail-fast and zero-retry for arbitrary provides. Unknown side effects are never replayed automatically.
3. A workflow invokes a generated Pi-PE target under a host-minted, attenuated grant. The pipeline inherits authority; it does not mint or broaden it.
4. Every agent handoff has a public schema. When shapes differ, a deterministic domain adapter provide performs the conversion.
5. Workflow acceptance is recorded separately from pipeline execution status.
6. Pi Protocol receipts are canonical. Pi-PE step traces retain references to them rather than replacing them.
7. Pipeline definitions and development runs have separate stores and lifecycle rules.
8. Pi-Dev's workflow capability is explicit in its manifest and documentation. There is no hidden team or implicit orchestration path.

## First workflow

The first pipeline should be linear and read-only:

```text
pipeline input
  { task, context?, scope?, questions?, constraints? }
       |
       v
pi_dev.scout
  structured ScoutOutput
       |
       v
pi_dev.prepare_architect_request
  deterministic ArchitectRequest
       |
       v
pi_dev.architect
  structured ArchitectOutput
```

The adapter is required because the current architect contract accepts `context` as a string, while the scout returns a structured object. Pi-PE supports pointer selection and constants, not stringification or arbitrary transformation. Adding a transformation language to Pi-PE would weaken its data-only security boundary.

The explicit `pi_dev.plan_change` workflow wrapper should:

1. create or resume a development work unit;
2. mint or receive an attenuated principal/grant allowing only the pipeline and required downstream targets;
3. invoke the generated pipeline target;
4. retain the pipeline receipt and downstream receipt references;
5. run deterministic plan acceptance gates;
6. persist the phase envelope, gate reports, blockers, and next action;
7. return separate `executionStatus` and `accepted` fields.

## State model

For the first slice, use atomic, readable records under the Pi-Dev state root:

```text
<pi-dev-state>/workflows/<run-id>/
  run.json
  phases/
    plan-change.json
  gates/
    plan-acceptance.json
```

`run.json` is the source of truth for the development lifecycle. It stores identifiers and bounded summaries, not full model prompts or sensitive payloads by default. Protocol invocation IDs link to canonical receipts. If scale or concurrent writers later justify SQLite, migrate behind a repository interface; do not introduce two canonical stores.

## Options considered

### Selected: Pi-PE under an explicit Pi-Dev workflow layer

This reuses Pi-PE's strongest implementation while keeping development-specific lifecycle and policy in the development domain. The main risk is accidental duplication of sequencing or persistence; the ownership table and generated-target invocation rule prevent it.

### Rejected: make Pi-PE the complete development workflow plane

This would force work units, gates, correction, workspace policy, human approval, and durable resumability into a generic linear pipeline DSL. It conflicts with Pi-PE's explicit zero-retry and no-branching model.

### Rejected: merge Pi-PE into Pi-Dev

Pi-PE is useful for non-development capabilities. A merge would couple generic pipeline changes to agent-role policy and remove a clean reusable boundary.

### Deferred: create a generic workflow package

There is not yet evidence of two independent consumers needing the same lifecycle semantics beyond Pi-PE. Incubate the first explicit workflow inside Pi-Dev, behind interfaces that permit later extraction.

## Extraction and kill criteria

Extract a generic workflow package only when:

- at least two non-development domains need the same work-unit, gate, evidence, and resume semantics;
- measured duplicate implementation exists in both domains;
- the semantics cannot be expressed as Pi-PE pipelines plus domain adapters; and
- one package can own the contract without duplicating Pi Protocol provenance or authority.

Stop the integration if it requires Pi-PE to own human acceptance, filesystem policy, agent session persistence, arbitrary-side-effect retries, or work-unit statuses. Reconsider the boundary only if Pi-PE deliberately evolves into a generic durable workflow engine and the duplicated domain layer becomes measurable.

## Evidence anchors

- Pi Protocol explicitly says it is not a workflow engine: `pi-protocol/README.md:3-18`.
- Pi-PE declares deterministic linear, fail-fast, persisted pipelines: `pi-pe/README.md:3-24` and `pi-pe/README.md:246-299`.
- Pi-Dev declares five roles and no hidden orchestrator: `pi-dev/README.md:3-11`.
- The local factory requires code-owned sequencing, gates, correction, and durable evidence: `README.md:18-43` and `README.md:217-245`.
