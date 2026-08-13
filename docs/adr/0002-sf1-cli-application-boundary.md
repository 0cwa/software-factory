# ADR-0002: SF-1 CLI application boundary

- **Status:** Accepted for SF-1
- **Scope:** `.pi/factory`

## Decision

The production CLI is a thin argument and rendering boundary over one shared `FactoryApplication`. Workflow metadata, runtime execution, and inspection return a normalized application result; human and JSON output are renderings of that result. Workflow views use one normalized graph and digest. A host-composed `CapabilityPort` is an explicit injection seam for tests and embedding.

The standalone bin uses a project-local generated JavaScript Protocol/Pi-Dev provider host and never enables a fake provider. The host bundles the pinned Protocol v4.0.0 runtime and real Pi-Dev registrations; TypeScript Pi extensions are normal upstream because Pi loads extensions through jiti. Upstream issue #5 is an optional plain-Node export enhancement, not a Factory blocker. The prior plain-Node `./core` limitation is therefore no longer a Factory blocker, and standalone `run` now bootstraps the generated host before creating a run; startup errors are reported truthfully through [Kybernetria/pi-protocol#5](https://github.com/Kybernetria/pi-protocol/issues/5). Metadata and strict inspection remain available without a provider.

## Consequences

- `.pi/factory/runtime/` remains the sole ignored runtime state path and is never used for product policy.
- Request files are bounded UTF-8 regular files contained by the repository; ambiguous unsafe paths are rejected.
- Stable exit codes distinguish usage, failure, rejected acceptance, and unknown capability outcomes.
- Tests use a contract-faithful injected fake only inside disposable fixtures; production CLI has no fake mode or environment switch.
- Hash-checked source provenance is embedded beside the generated `dist/provider-host.js`; the bundle does not import copied reference trees.

## Final integration correction

The executor admits only the exact `plan-change@1` topology (seven named phases, four guards, and six guarded transitions) before runtime state or capability dispatch. The CLI exposes `inspect` and a thin `abandon <run-id> [--json]` operation with fixed operator identity; it does not expose resume/replay. Application failures retain a preallocated run ID, and failed `workflow show --format json` responses retain diagnostics while successful responses remain data-only.

Catalog final leaves and request files use required `O_NOFOLLOW`, canonical pre-open containment checks, regular-file and device/inode identity checks before and after one open-handle incremental max+1 read, and post-read path identity checks. Internal final-leaf symlinks and detected replacement fail closed. Repository discovery and runtime Git identity use one clean environment that strips inherited `GIT_*` variables case-insensitively and isolates HOME/XDG configuration. Snapshot manifests use bounded async directory iteration, include `.git`, exclude only the exact canonical `.pi/factory/runtime` subtree, and enforce incremental file hashing, a 16,384-entry limit, 128 MiB cumulative file limit, bounded symlink bytes, and a roughly 16 MiB encoded manifest limit. Git lock/index changes are mutation inputs and controlled tests keep Git metadata stable.

The residual file-race limitation is same-user concurrent replacement of an ancestor after checks; the final leaf itself is rechecked by identity. Native `openat2`/`openat` support is intentionally deferred because no portable Node helper is available; an approved helper becomes an architecture decision if deployment threat models require ancestor-race protection or an incident reproduces it. Repository identity remains unreleased schemaVersion 1 with only `head` and `filesDigest`; stale pre-merge runtime records are rejected and disposable runtime state should be cleared after branch updates. Validation covers the frozen install/typecheck/build/test/package/diff sequence, focused adversarial tests, clean-archive validation, and CLI smokes (the exact final test count is recorded in the PR body).

## Deferred trigger

The generated host uses the operator's existing Pi agent directory only for authentication and model catalogs. Nested sessions use in-memory session managers and settings, explicit cwd, and a resource loader with extensions, skills, prompt templates, themes, project context, and ambient project settings disabled. Scout and architect execute through direct in-process `invokeAs` calls with target-specific grants, bounded five-minute phase deadlines (ten minutes sequentially), cancellation propagation, idempotent disposal, and no replay after an unknown outcome. The host verifies registration and contract digest before readiness. Upstream issue #5 remains optional plain-Node export work and is not required by Factory. SF-2 remains deferred until the owner explicitly starts it; no TUI, retries, discovery marketplace, or generic workflow extraction is part of this decision.
