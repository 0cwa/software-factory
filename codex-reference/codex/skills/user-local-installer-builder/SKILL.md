---
name: user-local-installer-builder
description: Design, build, review, or validate turnkey installers that compile or assemble software in ephemeral environments and install only declared artifacts into user-owned locations, with dependency preflight, stable manifests, atomic activation, receipts, verification, upgrades, and uninstall. Use for no-root or user-local installers, containerized build pipelines, portable app setup, or clean-host installation workflows. Do not use for ordinary package-manager commands, system image construction, remote deployment, or installers that require unreviewed privileged changes.
---

# User-Local Installer Builder

Build on a disposable surface; install only a declared, reversible artifact set into the user’s environment.

## Define the installation contract

Read [Installer architecture](references/installer-architecture.md). Create an [Installer Manifest](assets/installer-manifest.template.json) before implementation. Resolve supported platforms, target prefix, commands, desktop or service integration, persistent state, build inputs, network needs, secrets, upgrade semantics, and uninstall promises.

## Workflow

1. Inspect the target without mutation. Distinguish build dependencies from runtime dependencies and user-owned paths from host or privileged paths.
2. Choose the lightest reproducible build surface: existing project tooling first, then an ephemeral container or sandbox when it prevents host pollution or pins toolchains. Do not use isolation as decoration.
3. Pin source identities and verify downloaded inputs with upstream signatures or hashes when available. Keep credentials outside images, logs, manifests, and receipts.
4. Build and test in a fresh environment. Stage only declared runtime artifacts; reject undeclared build caches, source trees, credentials, and host-specific paths.
5. Produce a deterministic install plan for create, update, replace, retain, and remove actions. Preserve user data and configuration across upgrades.
6. Use `safe-change-gate` for apply: preview exact paths, confirm authority, activate atomically when practical, capture one safe-change receipt per operation, and verify postconditions plus omissions. Keep the installer receipt as an aggregate domain record that references those operation receipts; do not redefine approval or rollback state in it.
7. Test the installed entry points in a clean user environment. Exercise a real operation, not only `--version`.
8. Prove uninstall from the receipt, retaining or removing user state according to the declared policy. Document rollback and interrupted-install recovery.

## Platform composition

Use the platform’s supported user-space mechanisms before inventing a custom layout. For secureblue or Fedora Atomic targets, compose with `secureblue-maintainer` and preserve its Flatpak, Homebrew, container, layering, hardening, and rollback guidance. Treat any host, privileged, or security-policy change as a separate adapter requiring explicit authority.

## Hard gates

- Never infer root, live-system, external-download, desktop-integration, service-enable, or destructive authority from “make an installer.”
- Never copy an entire build environment into the target prefix.
- Never overwrite unowned files or user configuration without a before snapshot and declared merge policy.
- Never call an install portable while embedding build-host paths or undeclared runtime dependencies.
- Never claim uninstall completeness without comparing the manifest, receipts, persistent-state policy, and post-uninstall state.

## Result

Return the target and authority boundary, manifest, build and runtime dependency split, pinned inputs, ephemeral build recipe, staged artifact inventory, install plan and preview, receipts, installed smoke evidence, upgrade and rollback behavior, uninstall proof, omissions, and next release action.
