# Secureblue Notes

Use these notes to preserve secureblue's security model while making practical changes. Verify release-specific details upstream when exact image names, toggles, or package behavior matter.

## Model

- secureblue is a security-focused desktop/server OS built from Fedora Atomic Desktop base images, generated with BlueBuild, and shipped as OCI bootable containers consumed by `rpm-ostree`.
- It is not a traditional mutable distribution or an install script. Updates are staged as deployments and take effect on reboot.
- It is not fully "immutable": `/usr` is read-only in the booted deployment, while `/etc` and `/var` remain writable and can override defaults.
- The value proposition is hardened defaults for Linux users, not maximum isolation like Qubes OS.

## Security controls to preserve

- SELinux enabled and enforcing.
- Signed bootable images and restrictive container image policy.
- Secure Boot key enrollment for secureblue kernel/module signing when Secure Boot is enabled.
- Automatic updates for rpm-ostree, Flatpak, Homebrew, and Podman.
- `hardened_malloc` globally and for Flatpaks.
- Trivalent as the preferred Chromium-based browser, with SELinux confinement.
- Unprivileged user namespaces denied to broad unconfined/container domains by default, while allowed for Flatpak and Trivalent through policy.
- Xwayland disabled by default on GNOME, Plasma, and Sway images.
- SUID-root removal, with `sudo`, `su`, and `pkexec` removed in favor of `run0`.
- Firewalld ports/services disabled by default.
- Kernel/module attack surface reduction, including module blacklists.
- Coredumps disabled, MAC randomization available, NTS chrony, Unbound DNS options, USBGuard tooling, and Flatpak permission hardening tools.

## Inspect and validate

```bash
rpm-ostree status --verbose
ujust audit-secureblue
ujust --choose
systemctl list-timers '*rpm-ostree*' '*flatpak*' '*brew*' '*podman*'
podman image trust show
getenforce
sestatus
```

Use `journalctl -b -u <unit>` or app terminal output to diagnose failures. Many allocator crashes mention `fatal allocator error`.

## Updates

- Automatic updates run on at least a daily cadence and are part of the security posture.
- Manual urgent update: `ujust update-system`.
- Check pending deployment: `rpm-ostree status`.
- Disabling update timers is a security degradation. If the user insists, name the affected timer and give a manual update replacement.

## Post-install baseline

Use these after a fresh rebase/install or when auditing a machine:

```bash
ujust enroll-secureblue-secure-boot-key
ujust set-kargs-hardening
ujust audit-secureblue
```

The ISO installer may already apply stable kargs. A rebase to secureblue/securecore may require `ujust set-kargs-hardening`.

Recommended optional hardening:

```bash
ujust setup-usbguard
ujust create-admin
ujust dns-selector
ujust toggle-mac-randomization
ujust toggle-bash-environment-lockdown
ujust setup-luks-fido2-unlock
ujust setup-luks-tpm-unlock
```

For VPN users, prefer system default DNS or systemd-resolved through `ujust dns-selector resolver resolved` to avoid DNS leaks; avoid forcing Trivalent DoH in that case.

## App installation policy

Prefer:

1. Flatpak from the verified Flathub remote for GUI apps.
2. Homebrew for CLI tools that do not need host integration.
3. Containers/dev environments for development tools, after acknowledging user namespace tradeoffs.
4. `rpm-ostree install` for host-level packages only when necessary; it creates a new deployment and usually needs a reboot.

Avoid asking the user to download and execute random binaries. AppImages are often incompatible because secureblue removes the old SUID fuse2 path and treats browser-downloaded binaries as an antipattern.

## Flatpak

secureblue includes Flatpak despite sandbox limitations because it provides a standard app isolation and permission model. Make permissions narrow.

Commands:

```bash
ujust flatpak-permissions-lockdown
ujust flatpak-reset-global-overrides
ujust harden-flatpak
ujust harden-flatpak APP-ID
```

`flatpak-reset-global-overrides` removes all global overrides, including secureblue's Flatpak `hardened_malloc` integration, so run `ujust harden-flatpak` afterward.

For a broken app, prefer per-app `flatpak override`/Flatseal changes over global overrides.

## hardened_malloc

For Flatpak allocator crashes:

- Remove `LD_PRELOAD` for that app with Flatseal, or use the narrowest equivalent override.
- Restore with `ujust harden-flatpak APP-ID`.

For non-Flatpak apps:

```bash
ujust with-standard-malloc <command>
```

For persistent launchers, copy the `.desktop` file to `~/.local/share/applications` and wrap only its `Exec=` command with `ujust with-standard-malloc`.

Do not disable hardened malloc globally.

## User namespaces

secureblue's distinctive model is SELinux-confined user namespaces:

- Flatpak and Trivalent can create user namespaces.
- Broad unconfined and container domains cannot by default.

Compatibility toggles:

```bash
ujust set-container-userns on
ujust set-container-userns off
ujust set-unconfined-userns on
ujust set-unconfined-userns off
```

Use `set-container-userns on` for Podman/Distrobox workflows. Use `set-unconfined-userns on` only when an app specifically needs unconfined user namespace creation, such as some non-Trivalent browsers, Electron apps, or Bubblejail. State that this is a security degradation.

Common errors:

- Podman/Distrobox: `OCI permission denied`.
- Bubblewrap: `bwrap: Creating new namespace failed: Permission denied`.

## Containers and image policy

secureblue rejects most container images by default unless policy permits them through `reject`, `signedBy`, or `sigstoreSigned` rules.

Inspect:

```bash
podman image trust show
```

If an image is rejected, error text may include `Source image rejected`.

Prefer user policy:

```bash
podman image trust set --type accept registry.example.com/namespace/image
```

System-wide policy requires `run0` and should be narrow:

```bash
run0 podman image trust set --type accept registry.example.com/namespace/image
```

Reset to defaults:

```bash
rm -f ~/.config/containers/policy.json
run0 cp /usr/etc/containers/policy.json /etc/containers/policy.json
```

For BlueBuild local builds on secureblue, upstream docs may require allowing unsigned build helper images in user policy, such as `docker.io/mikefarah/yq`, `ghcr.io/blue-build`, and `quay.io/fedora-ostree-desktops`. Keep these exceptions scoped to the user unless system-wide behavior is necessary.

## Kernel args and modules

Manage kargs with `rpm-ostree kargs` only when needed. Prefer:

```bash
ujust set-kargs-hardening
ujust remove-kargs-hardening
```

secureblue's standard kargs include mitigations such as init-on-alloc/free, IOMMU strictness, kernel lockdown confidentiality, module signature enforcement, slab hardening, Spectre/L1TF mitigations, disabled vsyscall, and disabled 32-bit vDSO. Do not remove these casually.

Blocked modules:

```bash
ujust override-enable-module mod_name
ujust override-reset-module mod_name
```

Bluetooth:

```bash
ujust set-bluetooth-modules on
ujust set-bluetooth-modules off
```

Printing:

```bash
ujust toggle-cups
```

CUPS printer discovery remains disabled by default because it increases attack surface.

## Known compatibility toggles

Steam:

```bash
ujust install-steam
```

Anti-cheat:

```bash
ujust toggle-anticheat-support
```

This relaxes `kernel.yama.ptrace_scope` from the strict default and is a security degradation.

Dangerzone:

```bash
ujust install-dangerzone
```

It requires container-domain user namespaces and ptrace changes for gVisor/Podman document processing. State the tradeoff.

VeraCrypt/iwd:

secureblue blocks most userspace access to the kernel crypto API through SELinux policy denying `AF_ALG` sockets. VeraCrypt and iwd may require disabling that module:

```bash
run0 -i semodule -v -d secureblue_deny_alg_sockets
```

This is a security degradation. Prefer alternatives when practical.

## Rebasing and custom images

Use `ujust rebase-secureblue` for switching between secureblue images when available.

For customizations beyond package layering, prefer a BlueBuild-derived image with secureblue as the base image. Upstream advises against forking secureblue for personal customization because syncing hardening changes is error-prone.

When testing unsigned custom images, upstream docs use `rpm-ostree rebase ostree-unverified-registry:...`; treat this as a test/development path, not a normal maintenance recommendation. Ensure the user understands signature verification is bypassed for that rebase.

## Sources checked 2026-06-08

- secureblue homepage: https://secureblue.dev/
- Features: https://secureblue.dev/features
- FAQ: https://secureblue.dev/faq
- Post-install: https://secureblue.dev/post-install
- User namespaces: https://secureblue.dev/articles/userns
- Flatpak: https://secureblue.dev/articles/flatpak
- Kernel arguments: https://secureblue.dev/articles/kargs
- Contributing/custom builds: https://secureblue.dev/contributing
- Repository: https://github.com/secureblue/secureblue
