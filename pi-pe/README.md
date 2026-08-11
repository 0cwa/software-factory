# Pi-PE

Pi-PE is a deterministic pipeline editor/executor for the shared `@kybernetria/pi-protocol` fabric. It composes existing provides into validated linear pipelines and registers each saved pipeline as a normal handler-backed protocol provide.

A saved pipeline named `daily-research` is discoverable and callable at:

```text
pi_pe_pipeline_daily-research.run
```

Pi-PE generates JSON manifests and in-memory handler closures, not executable source. Pipeline data cannot run JavaScript, shell commands, templates, expressions, or dynamically selected targets.

## Features

- compact provide catalog plus full schema description on demand;
- static `JsonSchemaLite` compatibility checks and explicit runtime-only review;
- complete pass-through or explicit RFC 6901 field bindings/constants;
- sequential, fail-fast execution with no automatic retries;
- trace, child span, caller, continuing-session, and cancellation propagation;
- pipeline/step timeouts and bounded intermediate output;
- pinned dependency fingerprints and reviewed compatible-change policy;
- static graph and runtime `AsyncLocalStorage` cycle guards;
- atomic readable persistence and startup reconciliation;
- disabled/unavailable and quarantined status without crashing unrelated pipelines.

## Install and load

This repository is a Pi package:

```bash
npm install
pi install /absolute/path/to/pi-pe
```

For a one-off run:

```bash
pi -e ./extension.ts
```

Pi-PE requires Node 22 or newer and a loaded `@kybernetria/pi-protocol` package/tool. The extension uses the process-wide shared protocol fabric.

## Management provides

The static `pi_pe` node exposes:

| Target | Purpose |
|---|---|
| `pi_pe.catalog` | Search/list compact capability cards |
| `pi_pe.describe_target` | Return one exact full contract and fingerprint |
| `pi_pe.validate_pipeline` | Validate without mutation |
| `pi_pe.save_pipeline` | Validate, persist, and register |
| `pi_pe.get_pipeline` | Return a spec and dependency status |
| `pi_pe.list_pipelines` | Return compact saved/disabled/quarantined cards |
| `pi_pe.delete_pipeline` | Delete only with `confirm: true` |
| `pi_pe.run_pipeline` | Run by ID with a diagnostic envelope |
| `pi_pe.dry_run_mapping` | Build step inputs from fixture outputs, without invocation |
| `pi_pe.reload_pipelines` | Reconcile disk state and registrations |

Example discovery flow:

```json
{ "target": "pi_pe.catalog", "input": { "query": "search", "generated": false } }
```

```json
{ "target": "pi_pe.describe_target", "input": { "target": "pi-search-extension.web_search" } }
```

Schemas are intentionally returned for one selected target, never dumped registry-wide.

## Pipeline specification

`schemaVersion: 1` is a closed, data-only DSL. IDs and step IDs use lowercase letters, numbers, `_`, and `-`; pipeline IDs are limited to 64 characters.

```json
{
  "schemaVersion": 1,
  "id": "search-and-fetch",
  "version": "1.0.0",
  "name": "Search and fetch",
  "description": "Runs two fixed research capabilities.",
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

Targets are exact and immutable at runtime. A `step` source may reference only an earlier step. `previous` means the immediately preceding step. An absent pointer selects the whole value.

### Pass mode

```json
{
  "id": "second",
  "target": "example.consume",
  "input": {
    "mode": "pass",
    "from": { "source": "previous" }
  }
}
```

The selected source schema must be assignable to the target input schema. Broad contracts produce `runtime_only` assurance.

### Object mode

Object mode starts with an empty object and applies bindings and JSON literal constants. Missing optional bindings are omitted; missing `required: true` bindings fail before invocation. `null` is present and is never treated as missing. Values are not coerced.

Destination pointers reject duplicate/prefix conflicts, malformed escapes, sparse/out-of-bounds array writes, and `__proto__`, `prototype`, or `constructor` segments.

## Validate, save, and invoke

Validate first:

```json
{
  "target": "pi_pe.validate_pipeline",
  "input": { "spec": { "schemaVersion": 1, "...": "..." } }
}
```

The result includes:

```json
{
  "valid": true,
  "assurance": "static",
  "errors": [],
  "warnings": [],
  "dependencies": [],
  "generatedTarget": "pi_pe_pipeline_search-and-fetch.run"
}
```

A valid runtime-only pipeline is not saved unless review is explicit:

```json
{
  "target": "pi_pe.save_pipeline",
  "input": {
    "spec": { "schemaVersion": 1, "...": "..." },
    "allowRuntimeOnly": true
  }
}
```

Saving materializes dependency snapshots and review metadata in `pipeline.json`. Invoke the generated provide directly for composable business output:

```json
{
  "target": "pi_pe_pipeline_search-and-fetch.run",
  "input": { "query": "Pi protocol", "url": "https://example.com" }
}
```

Or use `pi_pe.run_pipeline` while developing:

```json
{
  "target": "pi_pe.run_pipeline",
  "input": {
    "id": "search-and-fetch",
    "input": { "query": "Pi protocol", "url": "https://example.com" }
  }
}
```

The management call returns `status`, `output`, and a bounded trace with step IDs, targets, durations, byte sizes, hashes, and short previews. Generated provides return only the declared business output.

## Dry-run mappings

Supply fixture outputs keyed by step ID:

```json
{
  "target": "pi_pe.dry_run_mapping",
  "input": {
    "id": "search-and-fetch",
    "pipelineInput": { "query": "test", "url": "https://example.com" },
    "stepOutputs": {
      "search": { "results": [] },
      "fetch": { "content": "fixture" }
    }
  }
}
```

No target is invoked. Pi-PE reports each constructed input and validates it against the current target contract.

## Dependency policy

`pinned` is the default. The fingerprint covers canonicalized input/output schemas, execution type/configuration, sorted effects, and provide/node version. A changed or missing pinned dependency disables registration until the pipeline is reviewed and saved again.

`compatible` permits a changed fingerprint only when Pi-PE can statically prove:

- the execution type did not change;
- no new effects appeared;
- previously constructed inputs remain accepted;
- new outputs remain assignable to the pinned output contract.

Unknown compatibility is refused. Saving again is the explicit review action and pins the then-current snapshots.

## Limits and execution behavior

Optional spec limits:

```json
{
  "limits": {
    "timeoutMs": 120000,
    "maxSteps": 32,
    "maxIntermediateBytes": 1048576,
    "maxNestedDepth": 8,
    "maxInvocations": 128
  }
}
```

Hard ceilings are 100 steps, 10 MiB retained intermediates, 10 minutes, nested depth 16, and 1,000 downstream invocations. Individual steps may declare `timeoutMs`.

Execution is linear and fail-fast. Pi-PE performs **zero retries** and claims no rollback. On failure, diagnostics identify completed effect-declaring steps. Downstream policy enforcement remains authoritative.

Error categories include `PIPELINE_NOT_FOUND`, `PIPELINE_INVALID`, `DEPENDENCY_NOT_FOUND`, `DEPENDENCY_CHANGED`, `MAPPING_FAILED`, `STEP_INPUT_INVALID`, `STEP_FAILED`, `STEP_OUTPUT_TOO_LARGE`, `PIPELINE_TIMEOUT`, `PIPELINE_ABORTED`, `PIPELINE_CYCLE`, and `FINAL_OUTPUT_INVALID`.

## Persistence and recovery

Default state:

```text
~/.pi/agent/state/pi-pe/
  pipelines/<pipeline-id>/
    pipeline.json
    pi.protocol.json
  index.json
```

Set `PI_PE_STATE_DIR` to override the root (useful for tests or isolated installations). `pipeline.json` is the source of truth; `pi.protocol.json` is deterministic derived output. Writes use same-directory temporary files, `fsync`, and atomic rename. State directories and pipeline entries may not be symlinks.

On reload, Pi-PE:

1. reads only expected JSON files under safe pipeline directories;
2. validates all specs and the complete generated dependency graph;
3. disables unavailable or changed dependencies;
4. quarantines malformed/invalid entries in status;
5. registers unrelated valid pipelines.

To recover, fix or remove the affected `pipeline.json`, then call `pi_pe.reload_pipelines`. Pi-PE never imports `.ts`/`.js` from state. `index.json` can be deleted and is rebuilt.

## Security and limitations

- Pipeline specs are data, not an authorization boundary. Downstream provides still enforce policy.
- Targets cannot be selected from input values.
- Inputs/outputs are not written to Pi-PE logs. Management diagnostics use bounded previews and SHA-256 hashes.
- No branches, loops, joins, fan-out, parallel steps, retries, compensation, or cross-provide transactions are implemented in v1.
- `JsonSchemaLite` supports only `type`, `required`, `properties`, `items`, `enum`, and `description`; broad schemas require explicit runtime-only review.
- Generated-node replacement uses owned generation-pinned `ProtocolRegistration.replace()`; in-flight calls finish on their selected implementation without an unregister/register gap.

## Development

```bash
npm test
```

The test suite runs strict TypeScript checking plus pointer, mapping, compatibility, cycle, execution, cancellation, timeout, persistence, registration, and end-to-end management lifecycle tests.
