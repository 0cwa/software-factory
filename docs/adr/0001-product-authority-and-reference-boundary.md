# ADR-0001: Product authority and reference boundary

- **Status:** Accepted for SF-0
- **Scope:** `0cwa/software-factory`

## Decision

Product decisions are resolved in this order:

1. Owner direction;
2. GitHub issue #1 and its lean execution addendum;
3. Accepted product ADRs and contracts;
4. Relevant v0 comments;
5. Inventories;
6. Reference code.

The issue addendum is the sequencing authority for the first useful vertical workflow. Apply YAGNI: implement the smallest workflow that produces useful evidence, and do not add a generic abstraction before a second concrete use, a measured failure, or a release requirement proves the need. A simpler conservative rule wins over a selective or generalized mechanism until that trigger occurs.

The following capabilities remain deferred until their stated trigger is observed: workflow variants until a second variant exists; Pi-PE integration until direct Protocol mapping is repeatedly painful; delegated or parallel execution until a real workload needs it; XState or exhaustive graph machinery until a second non-trivial workflow or meaningful branching requires it; SQLite/viewer layers until bounded JSON and CLI inspection are measurably insufficient; a generic SSSF importer until a second customized stamped repository needs migration; candidate/evaluation lifecycle until an active baseline and concrete candidate exist; and automatic issue selection until explicit issue-to-draft-PR execution is repeatedly reliable.

## Reference-only migration evidence

These copied trees are **non-authoritative reference material**. They may inform migration decisions, but they do not define product behavior or ownership and must remain unmodified during SF-0:

- `pi-protocol/`
- `pi-pe/`
- `pi-dev/`
- `codex-reference/`
- `.claude/skills/sssf/`
- `plans/pi-pe-pi-dev-integration/`

The immutable tag `reference-package-3195d5e` identifies the preserved package baseline. Product implementation starts after this boundary; SF-0 adds documentation and repository policy only.

## Tracked and runtime state boundary

- `.pi/factory/` is the tracked product control-plane root. Committed definitions, contracts, prompts, and durable reviewed evidence belong here.
- `.pi/factory/runtime/` is the runtime-owned root for ephemeral execution state such as run records, journals, logs, caches, and temporary data. It is intentionally not authoritative and is ignored by the exact anchored rule `/.pi/factory/runtime/` in `.gitignore`.

Runtime state must not be used to smuggle product policy into the repository or replace committed evidence. Future runtime code owns creation and cleanup of this directory; this slice adds no package or runtime implementation.
