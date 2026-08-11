# License Scope

This document explains the license files and their intended scope in the reference package. It is documentation for navigating the tree, not legal advice. Preserve the applicable license notices when copying, modifying, or redistributing any component, and obtain qualified review for a distribution decision.

## Scope summary

| Scope | License notice | Applies to |
|---|---|---|
| Root SSSF repository | [`LICENSE`](LICENSE) | The root SSSF skill, root documentation, root diagrams, and root-owned material, subject to third-party notices |
| Pi-Dev package | [`pi-dev/LICENSE`](pi-dev/LICENSE) | The imported `pi-dev/` package and its package-owned source, tests, prompts, and documentation |
| Pi-PE package | [`pi-pe/LICENSE`](pi-pe/LICENSE) | The imported `pi-pe/` package and its package-owned source, tests, fixtures, and documentation |
| Pi Protocol repository/package | [`pi-protocol/LICENSE`](pi-protocol/LICENSE), [`pi-protocol/packages/pi-protocol/LICENSE`](pi-protocol/packages/pi-protocol/LICENSE) | The imported Pi Protocol repository and the distributable package under `pi-protocol/packages/pi-protocol/` |

The root license is MIT. The Pi package license files identify AGPL-3.0. The root MIT notice does not replace, relicense, or erase the package-level AGPL-3.0 notices. The package boundaries remain visible in the directory layout and in the original license files.

## Practical reading rule

When working on a file, start with the nearest applicable package license:

- root files and `.claude/skills/sssf/` use the root scope unless a file carries another notice;
- files under `pi-dev/` use the Pi-Dev package scope;
- files under `pi-pe/` use the Pi-PE package scope;
- files under `pi-protocol/` use the Pi Protocol scope, with the nested package license retained for `pi-protocol/packages/pi-protocol/`.

This is a navigation rule for the reference tree. It does not determine how copyright, combined works, dependencies, or network distribution should be assessed.

## Preserve notices

Do not delete, merge, or rewrite the package license files when flattening the source repositories into this reference package. Keep the root MIT `LICENSE` and the package AGPL-3.0 `LICENSE` files in their original package locations. Retain any additional copyright or third-party notices introduced by future imports.

## Dependencies and future additions

The package manifests identify dependencies, peer dependencies, and package licenses, but this document is not a complete inventory of every transitive dependency's license. A future release or public distribution should generate and review a dependency notice inventory appropriate to that release.

The reserved `codex-reference/` snapshot must not include credentials or runtime state. If it later includes third-party skills, plugins, or workflow material, preserve their own notices and record their source and license scope before distribution.

For source commit anchors and import boundaries, see [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md). For the complete repository map and publication exclusions, see [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md).
