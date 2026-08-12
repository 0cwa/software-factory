# Repository and Roadmap Orientation

Load this after the constitution and `sources.json`, before selecting or planning an issue.

## System map

```text
Pi Foundry
  prepares and evolves the exact repository Pi environment
        ↓
Software Factory
  owns software work units, visible workflow graphs, gates, worktrees,
  correction, acceptance, evidence, and draft-PR integration
        ↓
Pi Protocol
  owns capability contracts, authority, sessions, receipts, provenance
        ↓
Pi-Dev / Pi-PE / Taskplane / Fabric / other reviewed providers
  implement roles, fixed pipelines, delegated execution, or tools
```

The system is not one mega-repository and not one mega-agent. Each layer owns a stable question.

## Coordinating roadmaps

- Pi Foundry: https://github.com/0cwa/pi-foundry/issues/1
- Software Factory: https://github.com/0cwa/software-factory/issues/1

Always fetch the current issue bodies and direct dependency links. The summaries below orient selection; they do not replace live GitHub state.

## Foundry critical direction

Foundry's core sequence is:

```text
authority/safety
-> pinned workspace and clean fixtures
-> schemas/conformance/security/toolkit
-> inspector and exact artifacts
-> pure resolver/proposal
-> journaled transactions and common adapters
-> managed Pi package/patch backends
-> Factory/provider/evaluation integration
-> TUI/agent/CLI/update lifecycle
-> cleanup after parity
```

Factory integration work:

- pi-foundry #30: Factory component/default provider;
- #31: exclusive `development.workflow` variants;
- #32: `.pi/factory/` ownership-aware inspection;
- #33: sibling/cross-repository sources;
- #34: Factory evidence normalization;
- #35: developer harness overlay;
- #36: issue-specific capability assembly.

Foundry owns environment changes. Do not let an issue worker install or patch components directly.

## Software Factory critical direction

Factory's core sequence is:

```text
reference preservation and repository authority
-> `.pi/factory/` paths and TS workspace
-> schemas
-> inspectable graph/path compiler
-> resumable runtime
-> isolated worktrees and deterministic code/gates
-> Protocol adapter and bounded prompt/context/evidence
-> direct-Protocol plan-change vertical slice
-> primary software-change workflow
-> selectable variants
-> candidate/evaluation/security boundary
-> GitHub issue-to-draft-PR program
-> developer harness bootstrap and Foundry lifecycle
-> migration cleanup after parity
```

The first useful vertical slice is direct Protocol `plan-change`, not Pi-PE or Taskplane. Those become evaluated variants after the base contract works.

## Repository ownership

### `0cwa/pi-foundry`

Modify for:

- component catalogue, desired state, lock, inspection, proposals;
- package/settings/host-tool adapters and transactions;
- provider selection and environment approval;
- Foundry evaluation/promotion and lifecycle interfaces.

### `0cwa/software-factory`

Modify for:

- workflow schemas/graphs/runtime;
- work units, gates, worktrees, corrections, acceptance;
- Protocol/provider adapters;
- Factory evidence, interfaces, migration, autonomous development;
- repository-owned starter workflows/prompts/policies.

The current `main` commit `3195d5e...` is a reference bundle and migration source. Copied `pi-protocol/`, `pi-dev/`, and `pi-pe/` directories are not implementation authorities.

### `Kybernetria/pi-protocol`

Modify only for missing generic capability/authority/session/receipt behavior proven by an integration test.

### `Kybernetria/pi-dev`

Modify for public role contracts or provider implementation; not for Factory work-unit/workflow ownership.

### `Kybernetria/pi-pe`

Modify for generic fixed-pipeline schema/receipt/runtime behavior; not for Factory gates, retries, worktrees, or acceptance.

## Source modes

Normal supported use prefers exact reviewed packages/releases. Coordinated development may use exact commits or symbolic sibling workspaces. Every mutable source is resolved to an exact identity before execution/evaluation.

Never:

- commit absolute sibling paths;
- use a copied source tree as the fix target;
- import dependency internals across repository boundaries;
- assume a dirty local checkout is reviewed compatibility.

## Work selection

A ready issue has:

- exact repository/number;
- open state and no conflicting active work;
- resolved prerequisites;
- clear scope/non-goals/acceptance criteria;
- executable validation or an explicit evidence plan;
- no unresolved product/owner decision that changes architecture;
- required capabilities available or resolvable through Foundry.

Prefer the highest-priority ready issue on the current critical path, but begin with an explicit issue URL/number until automatic selection is proven.

## Cross-repository blockers

When implementation discovers a missing dependency contract:

1. write a focused consumer acceptance fixture;
2. create/link an issue in the authoritative repository;
3. record the exact interim source/commit if dogfooding a fix;
4. stop or create an explicit child work unit;
5. do not duplicate the implementation or silently patch the consumer copy.

## Context discipline

For a selected issue load:

- coordinating epic;
- issue body;
- direct prerequisites and linked active PRs;
- accepted ADR/schema/contract files it names;
- relevant implementation/tests;
- current Foundry/Factory environment status.

Do not load all 60+ issues, full histories, entire trace databases, or every package README unless the issue requires them.
