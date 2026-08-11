# Source Provenance

This document records the source repositories and commit anchors represented by the reference package. The commit values identify the inspected source versions; they do not mean that the new reference package preserves the source repositories' Git histories.

## Imported source components

| Reference path | Source repository | Commit anchor | Role in this package |
|---|---|---:|---|
| `.` and `.claude/skills/sssf/` | `disler/super-simple-software-factory` | `de31374` | Root SSSF skill, documentation, diagrams, and factory templates |
| `pi-dev/` | `kybernetria/pi-dev` | `67f4682` | Profile-backed development role providers |
| `pi-pe/` | `Kybernetria/pi-pe` | `b95acff` | Deterministic Pi Protocol pipeline editor/executor |
| `pi-protocol/` | `kybernetria/pi-protocol` | `3699319` | Capability contracts, fabric, authority, sessions, and provenance |

The source repository names are retained as provenance labels. Case differences in the displayed GitHub organization name reflect the recorded source remotes, not a separate component.

## Local reference material

`plans/pi-pe-pi-dev-integration/` is the integration planning material created for this reference package. It is not a vendored upstream repository. The root orientation documents are also package-level reference material and should be read alongside the source READMEs.

## Codex reference snapshot

`codex-reference/` is a curated, sanitized export of selected global Codex instructions, skills, workflows, adjacent agent conventions, and nonsecret settings. Its [EXPORT_MANIFEST.md](codex-reference/EXPORT_MANIFEST.md) is the authoritative record of the allowlist and validation performed for that export.

The snapshot records source categories rather than copying a live runtime directory. It includes selected global instructions, rules, skills, and workflow material under `codex/`, adjacent agent skills under `agents/`, and adjacent Claude instructions and skills under `claude/`. It does not reproduce authentication files, installation IDs, session data, transcripts, databases, caches, or host-specific trust configuration. `codex/config.example.toml` documents portable setting names and defaults without preserving machine-local values.

## Import policy

Source packages are represented as ordinary directories in the reference package. Their nested `.git/` directories, indexes, remotes, object databases, packfiles, branches, and commit histories are excluded. This keeps the reference tree navigable and prevents an import from silently becoming a submodule or publishing unrelated repository metadata.

The provenance table is therefore the history boundary: it records where the imported working-tree content came from without embedding those repositories' histories in the destination package.

## Verification expectations

Before any external publication or redistribution, verify that:

- the working tree contains no nested `.git/` directory in the export;
- the recorded source commits match the imported source snapshots;
- no credentials, tokens, private keys, environment files, runtime databases, logs, sessions, or caches are selected;
- absolute local paths and private hostnames have been removed or replaced with repository-relative examples;
- generated artifacts are either source-consistent or explicitly excluded and reproducible from documented build commands.

This is a provenance record, not a security scanner or a license opinion. The publication boundary and license scope are documented separately in [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) and [LICENSES.md](LICENSES.md).
