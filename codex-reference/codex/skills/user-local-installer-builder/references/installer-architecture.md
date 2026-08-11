# Installer Architecture

Separate four surfaces: source acquisition, disposable build environment, staged runtime artifact set, and user-owned installation target. Each transition needs an inventory and provenance record.

Prefer XDG-compatible user locations and an explicit prefix. Record commands, libraries, desktop files, icons, services, configuration defaults, caches, logs, and persistent data separately. Generated launchers must resolve the installed prefix without embedding the build workspace.

Upgrades compare the prior receipt with the new manifest. The installer receipt is the aggregate domain record for installed ownership: reference each applied mutation by its `safe-change-run@1.0.0` run ID, operation ID, and evidence location instead of reproducing apply approval, operation results, or rollback state. Replace owned artifacts atomically where practical, retain declared user state, remove only previously owned obsolete artifacts, and stop on ownership drift. Uninstall removes receipt-owned runtime artifacts, restores replaced files when possible, and follows the explicit persistent-state policy.

An ephemeral container may pin toolchains and protect the host, but it does not prove reproducibility by itself. Pin base image identity, source revisions, dependencies, and output checksums; rebuild from a clean surface.
