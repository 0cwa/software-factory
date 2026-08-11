# Codex Reference Export Manifest

## Disposition

This directory is a portable, sanitized reference snapshot of selected global
agent instructions, skills, workflows, and nonsecret Codex settings. It is
reference material, not a drop-in copy of a user's runtime directory.

Only `codex-reference/**` was created or modified for this export.

## Allowlisted sources

| Source | Destination | Treatment |
| --- | --- | --- |
| `<CODEX_HOME>/AGENTS.md` | `codex/AGENTS.md` | Copied as reference text; no absolute user-home references were found in the copied file. |
| `<CODEX_HOME>/skills/*` excluding `.system` | `codex/skills/` | Copied as the user-authored/local skill set. |
| `<AGENTS_HOME>/skills/*` | `agents/skills/` | Copied as adjacent agent skills. |
| `<AGENTS_HOME>/.skill-lock.json` | `agents/.skill-lock.json` | Copied as skill provenance metadata. |
| `<CLAUDE_HOME>/CLAUDE.md` | `claude/CLAUDE.md` | Copied as adjacent agent instructions. |
| `<CLAUDE_HOME>/skills/*` | `claude/skills/` | Copied as adjacent workflow/skill material. |
| Selected portable settings from `<CODEX_HOME>/config.toml` | `codex/config.example.toml` | Recreated manually; project trust paths and machine-specific entries omitted. |
| `<CODEX_HOME>/rules/default.rules` | `codex/rules/default.rules` | Recreated with useful portable rules, `<USER_HOME>` placeholders, and sensitive rules omitted. |

The source trees were copied without following symlinks. The source allowlist
and the resulting export currently contain no symlinks.

## Configuration sanitization

The example configuration retains only nonsecret, portable model, reasoning,
service-tier, approval-reviewer, and feature settings. It intentionally omits
all project trust tables, absolute workspace paths, credentials, runtime
identifiers, and local installation settings.

The rules snapshot retains the rule structure and portable command patterns.
Rules containing credential/key/token file access or secret-bearing command
payloads were omitted. Local paths were replaced with `<USER_HOME>`.

## Explicit exclusions

The following were not copied:

- `auth.json`, `installation_id`, credentials, private keys, token files, and
  secret-bearing files;
- histories, sessions, attachments, logs, SQLite state databases, shell
  snapshots, locks, temporary directories, and caches;
- plugin caches, generated/plugin staging trees, and system-generated skills;
- the complete source `config.toml`; only the sanitized example was recreated;
- project-specific trust entries and machine-specific absolute paths;
- any source outside the explicit allowlist above.

The skill named `taste-to-token-map.md` is retained because it is a normal
design-reference skill path; the filename is not credential material.

## Path normalization

The copied text was checked for machine-specific user-home references. None remained in the
export after copying. Any future intentional local path example should use
`<USER_HOME>` or be documented here.

## Validation evidence

Validation was run against the resulting `codex-reference` tree:

- path-only secret-pattern scan: passed; no matching private-key, common API
  token, credential, `.env`, or secret-bearing filename/content pattern was
  reported;
- symlink scan: passed; no symlinks were present;
- absolute-path scan: passed; no local user-home reference remained;
- runtime-artifact filename scan: passed; no auth, history, session,
  attachment, log, SQLite, shell-snapshot, cache, temporary, or credential
  artifact was selected;
- allowlist shape check: passed; the export contains the two sanitized Codex
  files plus only the listed source trees and metadata.

The checks report paths and dispositions only. Secret values are not included
in this manifest or in the export report.

## Integration notes

Consumers should treat this snapshot as a catalog of reference behavior:

- `codex/skills/` contains the primary reusable Codex skill family;
- `agents/skills/` and `claude/skills/` contain adjacent agent conventions;
- `codex/AGENTS.md` and `claude/CLAUDE.md` provide global instruction context;
- `codex/config.example.toml` is a starting point requiring local review;
- `codex/rules/default.rules` is a sanitized policy reference and must be
  reviewed before being used in another environment.

No authentication, session continuity, local project trust, or runtime state
is conveyed by this snapshot.
