# Pi-PE Full Implementation Plan

Status: implemented
Target: Pi extension and canonical Pi Protocol schemaVersion 1 pipeline builder
Primary outcome: create discoverable handler-backed provides by safely composing existing protocol provides into validated linear pipelines

## 1. Product definition

Pi-PE is the pipeline editor/executor for the existing pi-protocol fabric. It does not replace pi-protocol and does not invent another capability transport.

A user defines a named pipeline such as:

```text
search -> fetch -> summarize -> store
```

Pi-PE discovers each target provide, inspects its full input/output schema, validates every connection, stores a declarative pipeline specification, and registers the saved pipeline as a normal handler-backed protocol provide. Invoking that generated provide runs the preconfigured sequence so each step's output becomes, or is mapped into, the next step's input.

The orchestration is deterministic and inspectable. Individual downstream agent-backed provides may remain nondeterministic, but Pi-PE never uses an LLM to decide the runtime graph, mappings, error handling, or call target.

## 2. Scope and non-goals

### MVP scope

- discover registered protocol provides;
- build, validate, save, load, list, inspect, run, and delete linear pipelines;
- direct whole-output pass-through and explicit field bindings;
- register each saved pipeline as a discoverable handler-backed protocol provide;
- propagate trace, session, cancellation, and bounded execution details;
- detect static and runtime cycles;
- generate no executable TypeScript for normal operation;
- persist readable JSON specifications and generated manifests.

### Deferred

- arbitrary DAGs, branches, loops, joins, fan-out, and parallel execution;
- arbitrary JavaScript, `eval`, shell transforms, or template code;
- visual graph editor;
- distributed workers;
- implicit model-generated mappings;
- transactional rollback across unrelated provides;
- automatic retries of unknown side effects;
- hot replacement with zero registration gap if the fabric has no atomic replace primitive.

Starting with linear pipelines directly satisfies the requested output-to-input composition while keeping behavior understandable.

## 3. Architectural decisions

### 3.1 Two classes of protocol nodes

1. **Management node: `pi_pe`**
   - static manifest shipped with the package;
   - exposes catalog, validation, save, run-preview, inspection, and deletion handlers.

2. **Generated pipeline nodes: `pi_pe_pipeline_<safe-id>`**
   - one node per saved pipeline;
   - exposes a single handler-backed provide named `run`;
   - purpose, input schema, output schema, version, tags, effects, and display metadata come from the validated pipeline spec;
   - uses a generic closure-based runner, not generated source code.

A saved pipeline therefore has a stable target such as:

```text
pi_pe_pipeline_daily_research.run
```

One node per pipeline avoids replacing a large shared generated node when only one pipeline changes and makes ownership/cycle checks simple.

### 3.2 Declarative runtime only

Pipeline JSON is data. The runner interprets a small closed set of operations:

- pass the previous output unchanged;
- create an object from explicit source bindings;
- insert JSON literal constants;
- optionally select the pipeline's final output through one JSON Pointer.

No expression language is needed in MVP. No value may become a target name at runtime; targets are fixed when the pipeline is saved.

### 3.3 Schema validation before registration and during execution

Save-time validation catches structural incompatibilities. Runtime validation remains authoritative because schemas may be broad, providers may change after save, and pi-protocol validates actual invocation values.

Every pipeline pins a fingerprint of each dependency's described provide contract. Invocation checks current fingerprints and either:

- runs when unchanged;
- refuses with `DEPENDENCY_CHANGED` by default;
- runs only when the pipeline explicitly uses a reviewed compatibility policy.

Do not silently reinterpret a pipeline after a dependency schema changes.

## 4. Proposed package layout

```text
pi-pe/
  package.json
  tsconfig.json
  pi.protocol.json
  extension.ts
  README.md
  IMPLEMENTATION_PLAN.md
  pi-research-philosophy.md
  pi-research-prompts-v2.md
  src/
    types.ts
    errors.ts
    schemas.ts
    config.ts
    protocol/
      handlers.ts
      manifest.ts
      registration.ts
      catalog.ts
    pipeline/
      validate.ts
      compatibility.ts
      pointers.ts
      map-input.ts
      execute.ts
      cycles.ts
      fingerprints.ts
      limits.ts
    storage/
      repository.ts
      atomic-write.ts
      paths.ts
    generated/
      manifest.ts
      register.ts
  test/
    manifest.test.ts
    spec.test.ts
    pointers.test.ts
    mapping.test.ts
    compatibility.test.ts
    cycles.test.ts
    execution.test.ts
    registration.test.ts
    storage.test.ts
    integration.test.ts
  fixtures/
    passthrough.pipeline.json
    mapped.pipeline.json
    cycle-a.pipeline.json
    cycle-b.pipeline.json
```

## 5. Pipeline specification

```ts
interface PipelineSpecV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  tags: string[];
  inputSchema: JsonSchemaLite;
  outputSchema: JsonSchemaLite;
  limits?: {
    timeoutMs?: number;
    maxSteps?: number;
    maxIntermediateBytes?: number;
  };
  dependencyPolicy?: "pinned" | "compatible";
  steps: PipelineStepV1[];
  output?: ValueSource;
  createdAt: string;
  updatedAt: string;
}

interface PipelineStepV1 {
  id: string;
  target: string; // exact nodeId.provide, fixed at save time
  input:
    | { mode: "pass"; from: ValueSource }
    | {
        mode: "object";
        bindings: Binding[];
        constants?: Array<{ to: string; value: JsonValue }>;
      };
  timeoutMs?: number;
}

interface Binding {
  to: string; // RFC 6901 JSON Pointer in the step input
  from: ValueSource;
  required?: boolean;
}

type ValueSource =
  | { source: "pipeline_input"; pointer?: string }
  | { source: "previous"; pointer?: string }
  | { source: "step"; stepId: string; pointer?: string };
```

For a linear MVP, `source: "step"` may reference only an earlier step. `previous` is shorthand for the immediately preceding step. Empty pointer means the whole value.

Example:

```json
{
  "schemaVersion": 1,
  "id": "search-and-fetch",
  "version": "1.0.0",
  "name": "Search and fetch first result",
  "description": "Searches the web and fetches a caller-selected result URL.",
  "tags": ["research"],
  "inputSchema": {
    "type": "object",
    "required": ["query", "url"],
    "properties": {
      "query": { "type": "string" },
      "url": { "type": "string" }
    }
  },
  "outputSchema": { "type": "object" },
  "dependencyPolicy": "pinned",
  "steps": [
    {
      "id": "search",
      "target": "pi-search-extension.web_search",
      "input": {
        "mode": "object",
        "bindings": [
          {
            "to": "/query",
            "from": { "source": "pipeline_input", "pointer": "/query" },
            "required": true
          }
        ],
        "constants": [{ "to": "/max_results", "value": 5 }]
      }
    },
    {
      "id": "fetch",
      "target": "pi-search-extension.fetch_content",
      "input": {
        "mode": "object",
        "bindings": [
          {
            "to": "/url",
            "from": { "source": "pipeline_input", "pointer": "/url" },
            "required": true
          }
        ]
      }
    }
  ],
  "output": { "source": "step", "stepId": "fetch" },
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

The example intentionally avoids a fragile assumption about search output shape. Once that output schema is precisely known, a binding may select a result URL.

## 6. Management protocol surface

The static `pi_pe` manifest uses canonical schemaVersion 1 contracts; exact handler bindings are private owned registrations.

| Provide | Purpose |
|---|---|
| `catalog` | compact search/list of available provides, excluding or including generated pipelines by filter |
| `describe_target` | return the full schema and fingerprint for one exact provide |
| `validate_pipeline` | validate a candidate spec without writing or registering it |
| `save_pipeline` | validate, atomically persist, and register a pipeline |
| `get_pipeline` | retrieve one readable pipeline spec and dependency status |
| `list_pipelines` | list compact saved-pipeline cards |
| `delete_pipeline` | unregister and delete one pipeline after explicit request |
| `run_pipeline` | run a saved pipeline by ID; useful before callers adopt the generated target |
| `dry_run_mapping` | show each constructed step input using supplied fixture outputs without invoking targets |
| `reload_pipelines` | re-read persisted specs and reconcile generated registrations |

`save_pipeline`, `delete_pipeline`, and `reload_pipelines` are write/control operations. They must be serialized through one registry mutation lock.

The generated node's `run` provide accepts exactly the pipeline's declared `inputSchema` and returns exactly its declared `outputSchema`.

## 7. Catalog and dependency discovery

Use `fabric.registry()` for compact cards and `fabric.describeProvide(nodeId, provide)` for selected full contracts. Pi-PE should never dump every full schema into a model context.

Catalog behavior:

- exact targets use the canonical `nodeId.provide` form;
- filters support text, node ID, tags, execution type, effects, and generated/non-generated status;
- management and generated nodes are clearly labeled;
- unavailable targets fail validation;
- a pipeline cannot depend on its own generated target;
- dependency metadata stores node ID, provide name, execution type, effects, schema fingerprint, and observed package/provide version.

A fingerprint is a stable hash of canonicalized input schema, output schema, execution metadata, and provide version. Canonicalization sorts object keys recursively.

## 8. Mapping semantics

### 8.1 JSON Pointer

Use RFC 6901 pointer syntax only. Implement it locally with tests or use one small audited dependency. Reject:

- malformed escapes;
- traversal through non-containers;
- array indexes outside bounds;
- duplicate destination pointers;
- destination writes that conflict (`/a` and `/a/b` in one mapping);
- prototype-pollution keys such as `__proto__`, `prototype`, and `constructor` at any destination segment.

### 8.2 Missing values

- if `required: true`, a missing source fails before target invocation;
- if `required: false`, omit the destination property;
- `null` is a present value and is not treated as missing;
- constants are deep-cloned JSON values;
- bindings never coerce types automatically.

### 8.3 Pass mode

`pass` is valid when the selected source schema is structurally assignable to the target input schema. Broad/unknown schemas can be marked `runtime_only`, but a save requires an explicit reviewed override and the generated pipeline reports that reduced assurance.

## 9. Schema compatibility

Pi-protocol `JsonSchemaLite` supports `type`, `required`, `properties`, `items`, `enum`, and `description`. Implement compatibility only for that subset.

Rules:

- identical primitive type is compatible;
- `integer` may flow to `number`, but not the reverse;
- source enum must be a subset of destination enum;
- object mapping must satisfy every destination required property;
- a source property used by a binding must exist unless its schema is intentionally broad;
- array item schemas must be compatible;
- `null` is compatible only with `null` because unions are not part of JsonSchemaLite;
- descriptions do not affect compatibility;
- absent type or generic object produces `unknown`, not automatic success.

Validation returns:

```ts
{
  valid: boolean;
  assurance: "static" | "runtime_only" | "invalid";
  errors: Issue[];
  warnings: Issue[];
  dependencies: DependencySnapshot[];
  generatedTarget?: string;
}
```

Runtime still relies on pi-protocol's input/output validation at every invoked provide. Pi-PE additionally validates its constructed step input before invocation so errors identify the pipeline step and mapping rather than only the downstream target.

## 10. Execution algorithm

For a generated `run` or `run_pipeline` call:

1. load the immutable validated in-memory pipeline snapshot;
2. verify the pipeline is enabled and within hard step limits;
3. compare dependency fingerprints according to policy;
4. create a run ID and runtime cycle guard;
5. for each step in order:
   - check abort signal;
   - resolve bindings from pipeline input and completed outputs;
   - validate the constructed input against the current target input schema;
   - invoke with `invokeTrackedFromCurrentContext()` so canonical causal context, session, and cancellation propagate;
   - enforce the step timeout through a composed `AbortController`;
   - on failure, stop immediately and return a step-qualified error;
   - bound the retained intermediate output and byte count;
6. select the final output;
7. validate it against the pipeline output schema;
8. return the output plus execution details only where the generated contract explicitly includes details.

A generated pipeline provide should return its declared business output directly. Management `run_pipeline` may return an envelope containing `status`, `output`, and a bounded step trace. This distinction keeps generated provides composable.

## 11. Trace, session, cancellation, and timeouts

- call downstream provides with `invokeTrackedFromCurrentContext(fabric, request)` and consume the tracked result plus receipt;
- allow protocol to create child span IDs and canonical caller IDs;
- preserve the incoming trace;
- inherit only supported continuing sessions; otherwise use downstream defaults;
- pass the incoming abort signal to every step;
- combine it with step/pipeline timeout signals;
- classify cancellation separately from execution failure;
- do not store full inputs/outputs in Pi-PE logs;
- return step ID, target, status, duration, and bounded previews/hashes for diagnostics.

## 12. Error and retry semantics

MVP is fail-fast and performs **no automatic retries**. Pi-PE cannot infer whether an arbitrary provide is idempotent or whether a failure occurred before or after a side effect.

Error categories:

- `PIPELINE_NOT_FOUND`;
- `PIPELINE_INVALID`;
- `DEPENDENCY_NOT_FOUND`;
- `DEPENDENCY_CHANGED`;
- `MAPPING_FAILED`;
- `STEP_INPUT_INVALID`;
- `STEP_FAILED` with downstream protocol error code;
- `STEP_OUTPUT_TOO_LARGE`;
- `PIPELINE_TIMEOUT`;
- `PIPELINE_ABORTED`;
- `PIPELINE_CYCLE`;
- `FINAL_OUTPUT_INVALID`.

A later retry feature requires protocol-level idempotency metadata or a user-maintained allowlist. If implemented, retry defaults to zero, is declared per step, uses bounded exponential backoff, preserves one trace, emits a span per attempt, and never retries policy denial, invalid input/output, or unknown write effects.

No automatic rollback is claimed. If an earlier step has side effects and a later step fails, the result reports completed side-effecting steps. Compensation steps are deferred until the protocol can represent and validate them explicitly.

## 13. Cycle prevention

### Static save-time cycle check

Build a directed graph where each generated pipeline target points to any generated pipeline targets referenced by its steps. On every save/reload:

- include all existing specs plus the candidate replacement;
- reject direct self-reference;
- reject indirect cycles using depth-first coloring or Tarjan SCC;
- report the exact target path forming the cycle;
- reject duplicate generated node IDs.

### Runtime guard

Use `AsyncLocalStorage` for an active pipeline target stack. Before running:

- reject if the target is already in the stack;
- enforce a hard nested-pipeline depth, default 8 and maximum 16;
- enforce a hard total downstream invocation count;
- pop the stack in `finally`.

Runtime protection remains necessary because another package may invoke a generated pipeline in a cycle that static analysis cannot see.

## 14. Persistence and generated registration

Default directory:

```text
~/.pi/agent/state/pi-pe/
  pipelines/<pipeline-id>/
    pipeline.json
    pi.protocol.json
  index.json
```

`pipeline.json` is the source of truth. The generated `pi.protocol.json` is deterministic derived output for inspection and portability.

Save sequence:

1. validate and compute generated artifacts in memory;
2. acquire repository/registration mutex;
3. write temp files and atomically rename;
4. unregister the previous generated node if replacing;
5. register the new node with its generic handler closure;
6. update the index;
7. release the mutex.

If registration fails after persistence, restore the previous files/registration where possible and return a degraded recovery message. Store the last known good snapshot in memory during replacement.

Startup/reload sequence:

1. register static `pi_pe` management node;
2. scan only expected pipeline directories;
3. validate every spec and the complete dependency cycle graph;
4. register valid generated nodes;
5. quarantine invalid entries in status output rather than crashing unrelated pipelines;
6. report dependency-unavailable pipelines as disabled/unavailable.

Never load `.ts`, `.js`, or arbitrary modules from the pipeline state directory.

## 15. Generated manifest

For each pipeline, derive:

```json
{
  "$schema": "https://pi.dev/protocol/manifest-v1.schema.json",
  "schemaVersion": 1,
  "node": {
    "id": "pi_pe_pipeline_<safe-id>",
    "purpose": "<description>",
    "tags": ["pipeline", "generated"]
  },
  "provides": [
    {
      "name": "run",
      "description": "<description plus fixed step summary>",
      "inputSchema": {},
      "outputSchema": {},
      "effects": ["protocol.invoke"]
    }
  ]
}
```

Effects are the conservative standard-effect union of dependencies plus `protocol.invoke`. This is informative, not a substitute for downstream policy enforcement. Generated descriptions list fixed targets but never include secrets or example payload values.

## 16. Optional Pi command/UI

Protocol capabilities are sufficient for MVP. A later `/pipeline` command may provide a guided TUI:

- browse provides;
- select a target;
- inspect schemas one at a time;
- add bindings;
- run mapping dry-run with sample JSON;
- validate and show warnings;
- confirm save/delete;
- show generated target.

The command calls the same domain services as protocol handlers. It must not contain a second validation implementation.

## 17. Implementation phases

### Phase 0 - Contract spike

- scaffold package and canonical schemaVersion 1 static manifest;
- prove registry/describe/invoke behavior against installed protocol APIs;
- register one in-memory generated handler node;
- prove nested causal propagation with `invokeTrackedFromCurrentContext()`;
- freeze `PipelineSpecV1`.

Exit: a hard-coded two-step pass-through pipeline is discoverable and invokable.

### Phase 1 - Validation and mapping core

- implement spec validation, safe IDs, JSON Pointer resolution, object construction, and compatibility rules;
- implement schema canonicalization and fingerprints;
- add exhaustive unit tests including prototype-pollution cases.

Exit: candidate specs receive deterministic static/runtime-only/invalid reports.

### Phase 2 - Runtime executor

- implement sequential invocation, context propagation, cancellation, timeouts, output bounds, final selection, and step-qualified errors;
- use fake protocol nodes for tests;
- implement no-retry fail-fast semantics.

Exit: pass-through and mapped pipelines run predictably under success, failure, timeout, and cancellation.

### Phase 3 - Persistence and dynamic provides

- implement atomic repository and generated manifests;
- implement one-node-per-pipeline registration and hot replacement;
- implement startup reconciliation and quarantine status;
- add static and runtime cycle guards.

Exit: a pipeline survives Pi reload and remains discoverable at the same target.

### Phase 4 - Management provides

- implement catalog, describe, validate, save, list, get, delete, run, dry-run mapping, and reload;
- add bounded outputs and explicit confirmation metadata;
- test dependency changes and unavailable nodes.

Exit: the complete lifecycle can be performed through the protocol tool alone.

### Phase 5 - Hardening and documentation

- test malicious IDs/pointers/constants, oversized intermediates, conflicting saves, recursive external calls, side-effect failures, and corrupted specs;
- document DSL examples, versioning, limitations, and recovery;
- run clean-install typecheck/tests.

Exit: README examples create and invoke a real pipeline from existing provides.

### Phase 6 - Only after MVP usage

Potential additions, in order:

1. package export with a generic runner and data-only spec;
2. protocol idempotency metadata and opt-in retries;
3. deterministic conditions and branches;
4. DAG fan-out/fan-in with bounded concurrency;
5. explicit compensation contracts;
6. guided TUI editor.

Each addition requires a spec version bump or backward-compatible optional fields.

## 18. Test matrix

### Spec/mapping

- valid IDs and rejected path-like IDs;
- empty, one-step, maximum-step, and over-limit specs;
- whole-value pass;
- nested source/destination pointers;
- arrays, null, missing optional/required fields;
- conflicting destinations;
- prototype-pollution segments;
- constants and deep-clone behavior.

### Compatibility

- primitive matches/mismatches;
- integer-to-number direction;
- enum subset;
- required object properties;
- array item compatibility;
- generic/unknown schemas produce runtime-only assurance;
- final output compatibility.

### Execution

- exact step order;
- output-to-next-input behavior;
- mapping from pipeline input and earlier steps;
- downstream `NOT_FOUND`, `INPUT_INVALID`, `OUTPUT_INVALID`, `FORBIDDEN`, `EXECUTION_FAILED`, `CANCELLED`, and `OUTCOME_UNKNOWN`;
- timeout and caller cancellation;
- oversized intermediate output;
- no implicit retry;
- nested trace and caller identity.

### Registration/storage

- static manifest and handlers match;
- generated manifest uses canonical handler execution;
- save, replace, delete, reload;
- atomic write recovery;
- invalid persisted spec quarantine;
- unavailable dependency status;
- schema fingerprint change;
- concurrent save/run behavior.

### Cycles

- direct self-call;
- two-pipeline and longer cycles;
- acyclic nested pipelines;
- runtime cycle through an external handler;
- nested depth and total invocation limits.

## 19. Acceptance criteria

- Pi-PE discovers existing provides through the shared fabric and describes full schemas only on demand.
- A valid saved pipeline is registered as a normal handler-backed protocol provide at a stable generated target.
- The generated input/output schemas exactly match the pipeline declaration.
- A step can pass a complete prior output or map explicit fields/constants into the next input.
- No pipeline spec executes JavaScript, shell, templates, or dynamically selected targets.
- Invalid schema connections are rejected or explicitly labeled runtime-only before save.
- Runtime validates every constructed input and final output.
- Nested invocations preserve trace, span, caller identity, session semantics, and cancellation.
- MVP performs no automatic retries and reports completed side-effecting steps on failure.
- Static and runtime guards prevent direct and indirect pipeline cycles.
- Saved specs and generated manifests are readable, atomic, versioned, and reloadable.
- A changed dependency schema disables a pinned pipeline until reviewed.
- Clean-install typecheck, unit, protocol, registration, and integration tests pass.

## 20. Risks and mitigations

| Risk | Mitigation |
|---|---|
| schemas are too broad to prove compatibility | runtime-only assurance requires explicit review; runtime validation remains authoritative |
| arbitrary mappings become a hidden programming language | closed binding/constant model; no expressions or eval |
| recursive generated pipelines loop | full graph validation plus AsyncLocal runtime stack and depth budget |
| a retry duplicates a side effect | no automatic retries in MVP |
| dependency update silently changes behavior | canonical schema/version fingerprint and pinned default |
| hot replacement loses a working pipeline | validate first, keep last-known-good in memory, serialize registration mutation, restore on failure |
| large outputs exhaust context/memory | per-step and total byte limits; bounded diagnostic previews |
| generated code becomes an injection surface | normal operation generates only JSON and in-memory closures |
| users assume cross-step rollback | explicit fail-fast partial-completion report and no transaction claim |

## 21. First build milestone

The first useful release should prove this loop:

1. list two existing protocol provides;
2. describe their selected schemas;
3. validate a two-step spec where step one output is passed or bound into step two input;
4. save it as readable JSON;
5. register `pi_pe_pipeline_<id>.run` as a handler provide;
6. invoke it with one root trace and visible child spans;
7. stop cleanly on downstream error or cancellation;
8. reload Pi and invoke the same generated target again.

That milestone should be completed before implementing DAGs, retries, conditions, code export, or a graphical editor.
