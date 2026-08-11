# Phased implementation plan

## Delivery rule

Each phase is independently mergeable. Do not start workflow features until the Pi-PE/Pi-Dev compatibility seam and canonical receipt semantics pass their gates.

## Phase 0 — establish an executable baseline

Goal: distinguish architectural gaps from stale or unbuilt local state.

Work:

1. Install dependencies in `pi-protocol`, `pi-pe`, and `pi-dev` using their declared package workflows.
2. Run protocol generation/checks before changing generated artifacts.
3. Run each package's typecheck and test suite unchanged.
4. Record versions, commands, and results in the implementation PR.

Gate:

- all three package baselines either pass, or every pre-existing failure is isolated and documented;
- no implementation change is used to hide a baseline failure.

## Phase 1 — make protocol schemas lossless across Pi-PE

Goal: save, reload, register, and invoke pipelines targeting Pi-Dev contracts without losing or rejecting canonical schema information.

Current blocker:

- Pi-PE's `validateJsonSchemaDefinition` accepts only `type`, `required`, `properties`, `additionalProperties`, `items`, `enum`, and `description` (`pi-pe/src/schemas.ts:38-50`).
- Pi-Dev uses canonical keywords including `maxLength` and `maxItems` (`pi-dev/pi.protocol.json:16-45`).
- Pi-PE persists dependency input/output schemas and validates them again during reconciliation.

Recommended design:

1. Separate the narrow schema used for Pi-PE's own v1 pipeline input/output DSL from the full canonical protocol schema stored in dependency snapshots.
2. Persist admitted dependency schemas losslessly; never strip unknown-to-Pi-PE canonical keywords.
3. Reuse Pi Protocol's canonical admission/validation types where possible.
4. Let static Pi-PE compatibility return `runtime_only` or `unknown` for schema features it cannot prove. Never claim compatibility by ignoring a constraint.
5. Keep runtime input/output enforcement at the protocol invocation boundary.

Likely files:

- `pi-pe/src/types.ts`
- `pi-pe/src/schemas.ts`
- `pi-pe/src/pipeline/fingerprints.ts`
- `pi-pe/src/pipeline/compatibility.ts`
- `pi-pe/src/pipeline/dependencies.ts`
- focused persistence/reconciliation/integration tests

Gate:

- a one-step pipeline targeting `pi_dev.scout` validates with an honest assurance level;
- save and reload preserve the complete dependency schemas byte-for-byte or canonically equivalently;
- startup reconciliation registers the pipeline instead of quarantining it;
- dependency fingerprint drift is still detected;
- unsupported compatibility remains fail-closed.

## Phase 2 — preserve canonical receipts and unknown outcomes

Goal: make Pi-PE traces usable as workflow evidence without creating a second provenance system or misclassifying cancellation.

Work:

1. Retain the tracked invocation receipt instead of discarding it after extracting `tracked.result`.
2. Add bounded receipt references to each `StepTrace`, using the actual Pi Protocol receipt contract: invocation ID, state/outcome, pinned contract/registration identity where available.
3. Preserve Pi Protocol's `OUTCOME_UNKNOWN` semantics after dispatch. Do not collapse it into a definitive pipeline abort or timeout.
4. Keep payloads out of traces; retain hashes, sizes, and bounded previews under existing policy.

Likely files:

- `pi-pe/src/pipeline/execute.ts`
- `pi-pe/src/types.ts`
- `pi-pe/test/execution.test.ts`
- cancellation and timeout tests

Gate:

- every completed step can be joined to a canonical protocol receipt;
- nested causal parentage remains correct;
- cooperative cancellation is reported as cancelled;
- non-cooperative post-dispatch cancellation remains outcome-unknown until the protocol receipt settles;
- no duplicate durable provenance ledger is added to Pi-PE.

## Phase 3 — add the deterministic Pi-Dev handoff adapter

Goal: make the first useful Pi-Dev pipeline expressible without weakening Pi-PE's data-only DSL.

Work:

1. Add a handler-backed `pi_dev.prepare_architect_request` provide.
2. Define strict input/output schemas using the existing Pi-Dev request and response types.
3. Convert the structured scout result into a stable, bounded architect `context` string and pass through task/constraints explicitly.
4. Declare deterministic, replay-safe traits and no effects beyond computation.
5. Update generated protocol bindings using the normal generation workflow.

The adapter must not call a model, access the filesystem, or infer new requirements. It is a deterministic shape conversion owned by the development domain.

Gate:

- identical input produces byte-identical output;
- ordering and truncation rules are specified and tested;
- oversized input fails or truncates with an explicit diagnostic;
- undeclared fields are rejected;
- no generic transformation language is added to Pi-PE.

## Phase 4 — provision the `pi-dev-plan-change` pipeline

Goal: prove Pi-PE can compose real Pi-Dev roles end to end.

Pipeline:

```text
pi_dev.scout
  -> pi_dev.prepare_architect_request
  -> pi_dev.architect
```

Work:

1. Add a versioned pipeline specification and a deterministic provisioning path.
2. Use pinned dependencies by default.
3. Use explicit JSON Pointer bindings for task, scope, questions, context, and constraints.
4. Set bounded time, intermediate-size, depth, and invocation limits.
5. Expose and test `pi_pe_pipeline_pi-dev-plan-change.run`.

Gate:

- validation, dry-run mapping, save, direct invocation, reload, and second invocation all pass;
- generated target and dependency fingerprints are stable;
- scout, adapter, and architect receipts form one causal subtree;
- dependency changes disable execution until explicit review;
- pipeline execution remains linear, fail-fast, and zero-retry.

## Phase 5 — add an explicit development workflow wrapper

Goal: combine Pi-PE execution with the best factory principles without moving those principles into Pi-PE.

Work:

1. Add a public `pi_dev.plan_change` workflow provide in an isolated `src/workflows/` module.
2. Add an internal work-unit/run contract with status, phase, dependencies, acceptance criteria, evidence references, blockers, and next action.
3. Add an atomic repository interface under the Pi-Dev state root.
4. Invoke the generated Pi-PE target under a host-minted principal and an attenuated grant.
5. Convert the pipeline output into a typed phase envelope.
6. Run a deterministic plan gate checking the declared plan, file targets, risks, and acceptance criteria.
7. Persist protocol receipt references and gate reports, then return separate execution and acceptance fields.
8. Update Pi-Dev documentation: there is still no hidden orchestrator; optional workflows are explicit, discoverable provides.

Gate:

- a successful pipeline with a failed gate returns `executionStatus: succeeded` and `accepted: false`;
- a passing gate persists evidence and returns `accepted: true`;
- interrupted runs retain a blocker and concrete next action;
- resuming never silently repeats an effectful step;
- raw prompts and sensitive payloads are not persisted by default.

## Phase 6 — worker/reviewer workflow, only after plan-change is stable

Goal: add mutation and review without turning Pi-PE into a branching workflow engine.

The Pi-Dev workflow state machine owns:

- workspace preflight and allowed-path policy;
- worker session identity;
- deterministic test and diff gates;
- reviewer verdict interpretation;
- bounded same-session correction;
- mandatory retest after any correction;
- final acceptance and optional commit approval.

Pi-PE may execute fixed linear subpipelines whose steps are safe to run exactly once in that phase. Branching, correction, and approval remain explicit workflow code.

Gate:

- blocking review findings cannot be accepted;
- a correction reuses the worker session and is bounded;
- any post-test code change invalidates the prior green test evidence;
- out-of-policy workspace changes fail closed;
- unknown side-effect outcomes stop automatic progress.

## File disposition

Reuse Pi-PE's executor, mapper, cycle guards, dependency fingerprints, atomic definition repository, and generated registration logic. Extend only schema interoperability and receipt projection in Pi-PE.

Add adapters, work-unit semantics, gates, and workflow persistence to isolated Pi-Dev modules. Do not add work-unit fields, retry policies, workspace permissions, or acceptance state to `PipelineSpecV1` or Pi-PE management handlers.

Pi Protocol should require no feature work for the first slice. Change it only if a focused integration test proves that a required generic receipt or authority operation is unavailable.

## Deferred work

- DAGs, branches, joins, fan-out, and parallel steps in Pi-PE
- generic automatic retries or compensation
- distributed scheduling
- cross-provide transactions
- human approval UI
- a generic workflow package
- SQLite migration for workflow records

These are upgrade seams, not first-slice requirements.
