# Pi-PE and Pi-Dev integration plan

Status: proposed
Decision date: 2026-08-08

## Decision

Use the three packages as separate, composable layers:

- `pi-protocol` remains the capability kernel: contracts, discovery, authority, invocation, sessions, receipts, and provenance.
- `pi-pe` remains the generic deterministic pipeline layer: fixed targets, JSON mapping, validation, dependency pinning, bounded linear execution, pipeline-definition persistence, and generated protocol provides.
- `pi-dev` remains the owner of software-development roles and gains a small, explicit workflow layer for development-specific work units, phases, gates, evidence, workspace policy, and correction rules.

Pi-PE should execute fixed subpipelines made from Pi-Dev provides. It should not become the software factory's work-unit engine, acceptance system, retry loop, workspace manager, or durable run store.

This means no new generic `pi-workflows` package now, and no merge of Pi-PE into Pi-Dev. Extract another package only after at least two independent domains demonstrate the same missing workflow semantics.

## Immediate finding

The architecture is viable, but direct Pi-PE/Pi-Dev composition is not yet proven. Pi-PE currently accepts a narrow schema subset, while Pi-Dev contracts use canonical protocol keywords such as `maxLength` and `maxItems`. A saved Pi-Dev pipeline may therefore fail reconciliation or be quarantined. Fix and test this seam before building workflow behavior.

## First usable outcome

Deliver an explicit `plan-change` workflow:

```text
pi_dev.plan_change
  -> pi_pe_pipeline_pi-dev-plan-change.run
       -> pi_dev.scout
       -> pi_dev.prepare_architect_request
       -> pi_dev.architect
  -> deterministic plan acceptance gate
  -> durable development run record
```

The adapter is a normal deterministic Pi-Dev provide because Pi-PE deliberately maps values but does not run arbitrary transformations. The workflow wrapper is also a discoverable provide; it is not a hidden orchestrator.

## Documents

- [Architecture and ownership](./ARCHITECTURE.md)
- [Phased implementation plan](./IMPLEMENTATION_PLAN.md)
- [Validation and release gates](./VALIDATION.md)
- [Machine-validated evidence case](./claim-evidence-case.json)

## Research basis

Two independent Luna scouts inspected Pi-PE, Pi-Dev, Pi Protocol, the local SSSF implementation, and relevant tests. Both recommended retaining Pi-PE as a lower-level deterministic pipeline engine and putting development lifecycle semantics above it. One scout additionally identified the schema-compatibility and receipt-preservation gaps that now lead the implementation sequence.

No package tests were run during scouting because dependencies are absent. Source and existing tests were inspected read-only.
