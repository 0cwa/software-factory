# Plan-change factory runtime

The pinned SF-1 plan-change workflow is a fresh-execution-only runtime. A run is claimed by an exclusive private directory and held by a narrow private execution lock for the whole process. `resume` never dispatches or writes: terminal runs are read-only no-ops, while nonterminal runs (including unknown outcomes) are blockers for inspection or operator abandonment. Abandonment takes the same lock and preserves outcome uncertainty.

Runtime records are bounded v1 JSON and JSONL evidence. Intent is fsynced before a capability call; state, results, artifacts, and parent directories are made durable. Only digests, selected plan fields, bounded diagnostic codes, and bounded Protocol v1 receipt projections are persisted. The capability port remains the source of receipts; SF-1 trusts that port projection until the Protocol commit is integrated.

The complete repository manifest includes tracked, ignored, generated, dependency, directory, regular-file, and symlink entries. It excludes only `.git` and the canonical runtime directory, never follows repository symlinks, and is compared before/after scout and at final acceptance. Any scout mutation prevents architect dispatch.

Dispatches have bounded deadlines, cancellation, and grace. A timeout or interrupted settlement becomes `outcome_unknown`; a late port settlement is ignored. There is no recovery engine, request persistence, SQLite store, lease renewal, CLI integration, or real Protocol integration in SF-1.
