---
name: secureblue-maintainer
description: "Use for configuring, maintaining, or troubleshooting secureblue hardened Fedora Atomic systems, including security-sensitive system changes."
---

# Secureblue Maintainer

## Operating stance

Treat secureblue as a hardened Fedora Atomic system shipped as signed bootable OCI images. Preserve the defaults unless the user explicitly asks to trade security for compatibility.

Before changing the system:

1. Inspect state with read-only commands first: `rpm-ostree status`, `ujust --choose` or `ujust --list`, `systemctl status <unit>`, `flatpak list`, `podman image trust show`, `getenforce`, `sestatus`, and relevant logs.
2. Prefer secureblue-provided `ujust` recipes over direct edits. They encode expected rollback behavior and local policy.
3. Prefer user-space app installation in this order: Flatpak from the verified Flathub remote, Homebrew for CLI tools, `toolbox`/`distrobox` only after enabling the needed user namespace policy, and rpm-ostree layering only when the package must be part of the host.
4. Keep host changes explicit and reversible. For each hardening relaxation, state the security cost, the exact command, and the rollback command.
5. Never suggest disabling SELinux, masking security update timers, broadly accepting unsigned containers, globally enabling unconfined user namespaces, or using `ostree admin unlock` as a routine fix.

Read [references/secureblue-notes.md](references/secureblue-notes.md) when the task touches system hardening, compatibility breakage, image policy, rebasing/custom images, or exact secureblue commands.

Read [Evidence-first troubleshooting](references/evidence-first-troubleshooting.md) when several layers could explain a failure, a proposed workaround weakens hardening, or version-specific advice needs current proof. Use `evidence-decision-research` for competing mitigation research and `safe-change-gate` before any live, privileged, or security-posture mutation.

## Common workflow

1. Identify the current image and deployment state.
   Use `rpm-ostree status --verbose`. Look for staged deployments, layered packages, image ref, rollback deployment, and pending reboot.
2. Classify the request.
   Use maintenance, app install, compatibility relaxation, kernel/module change, container/build, or custom image.
3. Choose the least invasive supported path.
   Use documented `ujust` commands before manual edits under `/etc`. Avoid modifying `/usr`; it is read-only in the booted deployment.
4. Validate after the change.
   Use `ujust audit-secureblue` for hardening posture, `rpm-ostree status` for deployments, app-specific smoke tests, and `journalctl` for failures.
5. Tell the user what changed.
   Include whether a reboot is needed, what security posture changed, and how to revert.

## Decision rules

- Updates: keep automatic updates enabled. For urgent manual updates, use `ujust update-system`, then inspect `rpm-ostree status` and reboot into the staged deployment.
- Kernel arguments: use `ujust set-kargs-hardening` for secureblue defaults. Use `rpm-ostree kargs` only when a specific unsupported karg change is required and explain rollback.
- Secure Boot: if kernel modules fail after installation or a migration, check whether the secureblue MOK was enrolled. Use `ujust enroll-secureblue-secure-boot-key`.
- Containers: expect remote images to be rejected by default. Prefer per-user policy for development exceptions. Avoid system-wide `accept` except for a narrow registry/repository the user trusts.
- User namespaces: Flatpak and Trivalent are specially allowed by secureblue policy. Enabling container-domain or unconfined user namespaces is a security degradation; do it only for a concrete app/workflow and mention rollback.
- Apps broken by `hardened_malloc`: prefer app-specific exceptions. Do not disable hardened malloc globally.
- Blocked kernel modules/services: enable only the named capability the user needs, such as Bluetooth, CUPS, or a specific module, using secureblue `ujust` toggles where available.
- Customization: if the user wants persistent host customization beyond simple package layering, recommend a BlueBuild-derived image based on secureblue rather than forking secureblue directly.


## Rootless Podman and run0 lessons

Use these rules when automating rootless Podman/container services on secureblue:

- `run0` is not `sudo`. It is `systemd-run` creating a transient service that runs through the `systemd-run0` PAM stack and inherits the service manager environment; treat it as a session boundary.
- For privileged host-maintenance commands, use `run0 -i` as the default (`-i` is `--via-shell --chdir='~'`) so command execution gets login-shell semantics and the expected environment handling.
- Use `run0 --pty` only when you explicitly need a pseudo-TTY attached to the command (for interactive terminal behavior, password prompts, full-screen apps, etc.). Use `run0 --pipe` only when you explicitly need raw, non-pty `stdin/stdout/stderr` streaming (for example, when output is consumed by another process/script). `--pipe` just connects the target process’ stdio directly to the caller; it does not add shell context, does not change privilege behavior, and does not choose a shell execution path by itself.
- Do not use `run0 -i` as a sudo-style mode for shell-less service users; in that case `-i` means `--via-shell --chdir='~'` and fails with `/usr/sbin/nologin`. For those accounts, use `run0 --pipe` or `run0 --pty` with explicit `--setenv` values and absolute command paths.
- To avoid repeated authentication prompts in install/uninstall scripts, parse arguments first, then re-exec once with login-shell behavior via `run0 -i /usr/bin/env ... /usr/bin/bash "$0" "$@"`. After that, run root operations directly inside the elevated process.
- For dedicated rootless Podman service accounts, verify `/etc/subuid` and `/etc/subgid` directly with `awk -F: '$1 == "USER" { print }' /etc/subuid`; some systems do not expose `subuid`/`subgid` through `getent`. Add only a non-overlapping range, and present it as a design choice for the rootless service-user model.
- Do not assume `run0 --user=SERVICEUSER podman ...` is equivalent to a normal user session. On secureblue, rootless Podman may fail there with `cannot clone: Permission denied` / `cannot re-exec process` even when `podman unshare true` works for a normal logged-in user and `ujust set-container-userns on` has already been applied. Prefer launching Podman through the target user's systemd user manager with `systemd-run --user --wait --pipe --collect`, after enabling linger and starting `user@UID.service`.
- If rootless Podman genuinely cannot create user namespaces, use secureblue's narrow control: `ujust set-container-userns on`. State the security cost and rollback: this enables user namespaces for the container domain, not global unconfined user namespaces; revert with `ujust set-container-userns off`.
- For rootless container services, prefer user units in the service account's user manager, e.g. `$HOME/.config/systemd/user/service.service`, enabled with `systemctl --user enable --now ...` under that user. Avoid system units with `User=SERVICEUSER` when they cause Podman/user-namespace failures under the system service context.
- Containers policy for a service account can remain strict for remote pulls while allowing local build output. A per-user `~/.config/containers/policy.json` may reject by default, require signed images for selected remote registries, and allow the local `containers-storage` transport. Local `containers-storage` acceptance is less broad than accepting unsigned remote Docker transports, but it is still a trust decision; scope it tighter when practical.
- Rootless Podman may not be allowed to relabel host paths under `/var/lib` with `:Z`. For service-owned state directories, explicitly label the state with `chcon -R -t container_file_t PATH` during setup, remove `:Z` from the volume option, and document that `restorecon` can undo this unless persistent file contexts are configured.
- When an image bootstraps application state into a build-time home such as `/opt/app`, but runtime mounts an empty service home such as `/var/lib/app`, seed the mounted home at container startup before starting the daemon. Otherwise CLI tools may report that no valid installation exists.

## ROCm containers on gfx1151 / Strix Halo

- GPU enumeration is not a sufficient health check: `torch.cuda.is_available()` and the device name can succeed while the first allocation or kernel launch crashes. Always run a real GPU smoke test that allocates a tensor, executes an operation, and verifies its result.
- Traditional ROCm userspace can segfault in `libhsa-runtime64` on first compute even when `/dev/kfd` and the intended `/dev/dri/renderD*` node are mounted correctly. Reproduce with a minimal HIP program or the same workload in a default Podman container before blaming container hardening.
- If the failure also reproduces without custom Podman restrictions, do not weaken SELinux, IOMMU, device isolation, or other secureblue/container controls as a workaround. Treat it as a ROCm/kernel/userspace compatibility problem and keep the existing hardening intact.
- For gfx1151, prefer AMD's architecture-specific TheRock packages from `https://rocm.nightlies.amd.com/v2/gfx1151/` over a generic traditional ROCm stack when that path fixes the compute test. The nightly index is mutable, so pin the resolved package versions and hashes for reproducible production builds.
- TheRock cannot mask a kernel-side regression. Linux 7.1 from rc7 onward has a reported gfx1151 GPU-memory-operations regression that was fixed in AMD's staging branch but remained reproducible on Fedora's 7.1.3-200 build. If the wheel-owned HSA runtime still fails in a default container, inspect `uname -r` and test a kernel containing the upstream amdgpu HMM fix before changing container security. See the [June 2026 amd-gfx report](https://www.mail-archive.com/amd-gfx@lists.freedesktop.org/msg145169.html).

## Compatibility tradeoffs

When a request requires weakening a default, use this format:

```text
This fixes <problem> by relaxing <control>. Security cost: <specific exposure>. Scope: <user/system, app/global>. Revert with: <command>.
```

Prefer narrow scope:

- Prefer one Flatpak override over global Flatpak overrides.
- Prefer `ujust harden-flatpak APP-ID` or removing one `LD_PRELOAD` override over global allocator changes.
- Prefer user container policy in `~/.config/containers/policy.json` over `/etc/containers/policy.json`.
- Prefer enabling `container_userns` for Podman/Distrobox over enabling unconfined user namespaces for all user processes.

## Source checks

secureblue changes quickly. For current behavior, verify against upstream docs or repository before giving final instructions for release-specific details, image names, kernel signing, or hardening toggles:

- https://secureblue.dev/
- https://secureblue.dev/faq
- https://secureblue.dev/features
- https://secureblue.dev/post-install
- https://secureblue.dev/articles/userns
- https://secureblue.dev/articles/flatpak
- https://secureblue.dev/articles/kargs
- https://github.com/secureblue/secureblue
