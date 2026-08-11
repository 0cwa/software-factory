# Validation and release gates

## Required command evidence

Run the package-native checks from each package root and retain the exact commands and versions in the implementation PR:

| Package | Required checks |
|---|---|
| Pi Protocol | protocol generation/check, typecheck, full tests |
| Pi-PE | `npm run typecheck`, `npm test`, `npm run protocol:check` |
| Pi-Dev | protocol generation/check, typecheck, full tests |

The exact Pi Protocol and Pi-Dev commands should follow their current `package.json` scripts. Generated artifacts must be regenerated, not edited by hand.

## Cross-package acceptance matrix

| Case | Expected result |
|---|---|
| Save a pipeline targeting `pi_dev.scout` | Accepted with an honest static or runtime-only assurance classification. |
| Reload the saved pipeline | Full canonical dependency schema survives and the pipeline registers. |
| Change a Pi-Dev dependency contract | Pinned pipeline disables until explicitly reviewed and saved. |
| Dry-run scout-to-adapter mapping | Exact expected adapter input; no target invocation. |
| Run scout-to-adapter-to-architect | Ordered success with one causal receipt subtree. |
| Adapter receives the same input twice | Byte-identical output. |
| Unsupported schema compatibility | Refused or marked runtime-only; never silently accepted. |
| Step exceeds output bound | Pipeline fails with bounded diagnostics and receipt reference. |
| Caller cancels before dispatch | No downstream effects and a definitive cancellation. |
| Caller cancels after non-cooperative dispatch | Outcome remains unknown until canonical receipt settlement. |
| Pipeline succeeds but plan gate fails | Workflow execution succeeds; workflow acceptance is false. |
| Dependency fingerprint changes after provisioning | Generated pipeline is unavailable until review. |

## Negative tests

- Reject direct scout-output pass-through to the architect when it violates the architect schema.
- Reject undeclared workflow and adapter fields.
- Reject cycles, future-step references, unsafe pointers, conflicting destinations, and dynamic targets.
- Reject grant broadening by pipelines or workflow inputs.
- Reject use of pipeline status as work-unit acceptance.
- Reject workflow persistence inside Pi-PE's pipeline-definition repository.
- Reject automatic replay after an unknown effectful outcome.
- Reject acceptance when required gate evidence or receipt references are missing.
- Reject resume when the last completed phase cannot be proven from durable state.

## First release gate

The first release is complete only when all of the following are true:

1. The unchanged baselines are known.
2. Pi-Dev schemas round-trip through Pi-PE save/reload/reconciliation.
3. Pi-PE exposes canonical receipt references and preserves outcome-unknown semantics.
4. The deterministic adapter contract passes.
5. The three-step read-only pipeline passes after a process reload.
6. The explicit workflow wrapper records a work unit, phase envelope, gate report, and receipt references.
7. Pipeline success and workflow acceptance are independently tested.
8. Documentation states the ownership boundaries and no-hidden-orchestrator meaning.

Worker/reviewer mutation is not part of this first release gate.

## Evidence not available during planning

Dependencies were absent in the scouting workspace, so this plan does not claim a fresh test pass. The first implementation action is therefore the baseline gate, not a source edit.
