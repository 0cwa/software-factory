# Repository Structure

This repository is a private reference package for an agentic harness development creator. It brings together the Super Simple Software Factory (SSSF), three Pi components, integration plans, and documentation of the portable global-configuration boundary.

The intended reader should be able to answer three questions quickly:

1. Which component owns a capability?
2. Which files are implementation, reference material, or plans?
3. Which local configuration and runtime material is deliberately outside the package?

## Top-level map

```text
software-factory/
├── README.md                         # SSSF overview and operating guide
├── REPOSITORY_STRUCTURE.md           # this orientation document
├── SOURCE_PROVENANCE.md              # source repositories and commit anchors
├── LICENSES.md                       # root/package license scope
├── LICENSE                           # root SSSF MIT license
├── .claude/skills/sssf/              # the installable SSSF skill
├── images/                           # diagrams used by the SSSF README
├── pi-protocol/                      # capability protocol kernel
├── pi-pe/                            # deterministic pipeline editor/executor
├── pi-dev/                           # profile-backed development role providers
├── plans/                            # architectural and integration plans
└── codex-reference/                  # sanitized portable global Codex snapshot
```

`codex-reference/` is an existing sanitized export of selected global Codex instructions, skills, workflows, adjacent agent conventions, and nonsecret settings. Its [EXPORT_MANIFEST.md](codex-reference/EXPORT_MANIFEST.md) records the allowlist, sanitization, exclusions, and validation evidence. It is reference material, not a drop-in copy of a live runtime directory.

## Component responsibilities

### `.claude/skills/sssf/`

The root SSSF skill is the installable software factory. Its `SKILL.md` provides the operating rules and routes work into cookbooks. The rest of the skill contains:

- `cookbooks/` for installation, configuration, workflow creation, updates, and operation;
- `references/` for configuration, handoff, and observability contracts;
- `scripts/` for generating configuration and workflows;
- `templates/` for the files stamped into a target repository;
- `apps/visualizer/` for the read-only SQLite trace viewer.

SSSF owns code-directed workflow sequencing, phase boundaries, typed envelopes, gates, retries/correction behavior, and run observability. A stamped target repository receives the factory runtime; this reference tree contains the skill and its source templates, not a target application's generated runtime state.

### `pi-protocol/`

Pi Protocol is the capability kernel and shared fabric. It provides the contracts, discovery and registration model, authority and grants, invocation, sessions, protocol projection, and causal provenance used by Pi extensions and providers.

It is infrastructure for invoking capabilities. It is not the software-development workflow owner, work-unit store, or acceptance-gate engine.

Useful entry points are in `packages/pi-protocol/`, with protocol checks, generation, diagnostics, and conformance scripts under `scripts/` and the package scripts in `package.json`.

### `pi-pe/`

Pi-PE is the deterministic pipeline editor/executor for Pi Protocol capabilities. It owns data-only pipeline definitions, validation, JSON-pointer input mapping, dependency fingerprints, bounded sequential execution, pipeline persistence, generated protocol registrations, and reconciliation.

Pi-PE intentionally does not become a general software-factory scheduler. Work-unit lifecycle, semantic acceptance gates, workspace mutation policy, human approval, durable workflow run state, and agent correction loops remain outside its pipeline definition layer. Integration plans treat Pi-PE as a reusable execution substrate beneath a development workflow layer.

### `pi-dev/`

Pi-Dev exposes profile-backed development-agent capabilities through Pi Protocol. Its role providers are:

- `scout` for read-only reconnaissance;
- `architect` for design and planning;
- `worker` for bounded implementation;
- `reviewer` for review and quality assessment;
- `security_reviewer` for security-focused review.

Pi-Dev owns role contracts, profiles, prompts, and provider behavior. It is intentionally not a hidden workflow orchestrator or worktree manager. A future development workflow can compose these roles through Pi-PE and retain SSSF/Codex ownership of phases, gates, evidence, and acceptance.

### `plans/`

`plans/pi-pe-pi-dev-integration/` records the proposed composition of the three Pi components with SSSF/Codex workflow semantics. It includes the architecture decision, implementation sequence, validation gates, and the evidence case behind the recommendation.

The plan's central boundary is:

```text
SSSF/Codex workflow plane
  phases, work units, gates, correction, acceptance, durable run evidence
        ↓
Pi Protocol
  authority, invocation, sessions, registrations, provenance
        ↓
Pi-PE
  fixed capability pipelines, mapping, bounds, dependency pinning
        ↓
Pi-Dev and other protocol providers
  bounded role execution
```

### `codex-reference/` (portable snapshot)

This is the curated global Codex reference snapshot. It is organized as portable reference material:

```text
codex-reference/
├── EXPORT_MANIFEST.md        # allowlist, exclusions, and validation evidence
├── codex/
│   ├── AGENTS.md             # portable global instructions
│   ├── config.example.toml   # sanitized settings template
│   ├── rules/                # portable command/approval rules
│   └── skills/               # selected Codex skills and references
├── agents/
│   └── skills/               # adjacent agent skills and metadata
└── claude/
    ├── CLAUDE.md             # adjacent global instructions
    └── skills/               # adjacent workflow and skill material
```

The snapshot omits authentication, installation identity, sessions, history, logs, SQLite state, attachments, shell snapshots, locks, caches, plugin staging, generated model caches, and host-specific trust paths. The complete source `config.toml` was not copied; `config.example.toml` is a sanitized template. The manifest is authoritative for the exact export boundary.

## Publication boundary

This is a reference package, not a machine backup. The intended export contains source files, tests, manifests, lockfiles, package documentation, plans, and selected reference assets.

The following are outside the publication boundary:

- nested `.git/` directories, Git indexes, remotes, packfiles, and independent package histories;
- authentication files, API keys, access tokens, passwords, private keys, and environment files;
- Codex or agent sessions, transcripts, history, attachments, logs, SQLite databases, queues, locks, and shell snapshots;
- dependency installations and generated runtime/build/cache output such as `node_modules/`, coverage, temporary directories, and plugin caches;
- host-specific absolute paths, trust entries, private hostnames, and unreviewed machine configuration.

The package directories may originate as independent repositories during development. The reference publication should import their working-tree contents as ordinary directories and record their source commits in [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md); it should not publish their nested histories or create Git submodules accidentally.

## Build and test entry points

Commands below are entry points, not a claim that they were run in every checkout. Install each package's dependencies before running its commands.

### SSSF skill

From a target repository after copying `.claude/skills/sssf/`:

```bash
uv run .claude/skills/sssf/scripts/install.py
```

The stamped workflows are run with `uv run adws/adw_*.py ...` or through the generated `justfile`. The visualizer is a Bun/Vite application under `.claude/skills/sssf/apps/visualizer/`; its README section documents the server and `bunx vite` entry points.

### Pi packages

From `pi-dev/`:

```bash
npm run typecheck
npm test
npm run protocol:check
```

From `pi-pe/`:

```bash
npm run typecheck
npm test
npm run protocol:check
```

From `pi-protocol/`:

```bash
npm run typecheck
npm test
npm run protocol:check
npm run protocol:doctor
```

The package READMEs and `package.json` files remain the authoritative details for package-specific prerequisites and test selection.

## Reading order for a harness creator

1. Read this document for ownership and boundaries.
2. Read the root [README](README.md) and `.claude/skills/sssf/SKILL.md` for the factory model.
3. Read `pi-protocol/README.md` for the capability kernel.
4. Read `pi-pe/README.md` for deterministic pipeline composition.
5. Read `pi-dev/README.md` for role-provider contracts.
6. Read `plans/pi-pe-pi-dev-integration/README.md` for the proposed integration and validation sequence.
7. Read [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md) and [LICENSES.md](LICENSES.md) before redistributing or adapting the package.
