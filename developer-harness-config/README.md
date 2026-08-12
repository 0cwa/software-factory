# Developer Harness Configuration

This directory is the transitional, self-contained source for the personal/project harness configuration used to develop Pi Foundry and Software Factory. It is intentionally shaped so it can later become the root of a private `developer-harness-config` repository without changing the schemas or references consumed by Foundry and Factory.

## Purpose

Prepare a Pi session to:

1. select one exact ready GitHub issue;
2. load only the authoritative context needed for that issue;
3. ask Pi Foundry to inspect and assemble the minimum reviewed capabilities;
4. run the issue through Software Factory in an isolated candidate worktree;
5. execute deterministic checks and independent review;
6. open a bounded evidence-backed draft PR;
7. stop at genuine owner, permission, unknown-effect, or product decisions.

This configuration is **not** the Factory runtime, the Foundry desired-state lock, the GitHub backlog, or a secret store.

## Authority order

1. Current owner direction.
2. Accepted product ADRs and coordinating epics.
3. Versioned schemas and contracts.
4. The exact dependency-linked GitHub issue being executed.
5. This configuration's protected constitution and policies.
6. Historical plans, reference snapshots, and Git history as evidence only.

Project/repository hard policy outranks personal defaults. A lower layer may specialize allowed behavior but may not expand authority, weaken security/recovery gates, or silently override acceptance criteria.

## Layout

```text
developer-harness-config/
  manifest.json
  AGENTS.md
  sources.json
  prompts/       layered, lazily loaded development instructions
  plans/         program map and generated active-plan projections
  profiles/      reviewed Foundry/Factory development defaults
  policies/      protected authority, permission, promotion, retention rules
  toolsets/      capability needs, not assumed package lists
  evaluations/   evaluation boundary and suite references
  templates/     issue plan, harness change, and handoff formats
```

## Bootstrap

A Pi session begins with `AGENTS.md`, then loads:

- `prompts/00-constitution.md`;
- `sources.json` and `prompts/10-orientation.md`;
- the exact selected issue and linked prerequisites;
- phase-specific prompts only when that phase starts.

It must not preload every issue, skill, prompt, trace, or repository file.

The session asks Foundry for the current effective environment before assuming a capability exists. Environment mutation requires an exact Foundry proposal and the applicable approval boundary. Factory then binds the run to the resulting environment receipt.

## State boundary

Tracked here:

- portable instructions, profiles, policies, tool needs, templates, and source references.

Never tracked here:

- credentials, tokens, auth files, private keys;
- live sessions, transcripts, history, logs, SQLite databases, caches, locks;
- shell snapshots, attachments, generated model caches;
- machine-specific project trust entries or absolute workspace paths.

Secrets remain external references. Machine paths belong in observations/receipts.

## Transitional branch and extraction

Current source: `0cwa/software-factory`, branch `developer-harness-config`.

When repository creation is available:

1. create a private repository;
2. move this directory's contents to its root;
3. pin the exact source commit in Foundry;
4. verify effective asset digests and behavior;
5. retain the branch as migration evidence until rollback expires;
6. remove duplication only after verified cutover.

See:

- Software Factory roadmap: https://github.com/0cwa/software-factory/issues/1
- Configuration issue: https://github.com/0cwa/software-factory/issues/25
- Pi Foundry roadmap: https://github.com/0cwa/pi-foundry/issues/1
- Foundry overlay issue: https://github.com/0cwa/pi-foundry/issues/35
