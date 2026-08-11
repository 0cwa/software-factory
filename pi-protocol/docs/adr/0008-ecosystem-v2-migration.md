# ADR 0008: Ecosystem migration and portable v2 distribution

- Status: accepted
- Date: 2026-07-29

## Context

The v2 kernel could not be considered complete while loaded extensions still admitted v0.2 deployment manifests, used unowned registration, exposed private agent policy, relied on a filesystem runtime linker, or resolved the protocol package through local source links.

## Decision

Pi Protocol v2 is released as `@kybernetria/pi-protocol@2.0.0`. The signed Git tag and GitHub release include the normal npm package tarball:

`https://github.com/Kybernetria/pi-protocol/releases/download/v2.0.0/kybernetria-pi-protocol-2.0.0.tgz`

This portable artifact is used by every loaded protocol extension. Each installation receives a normal package copy; compatible copies converge on the process-wide host ABI. No filesystem runtime linker remains.

Every recursively discovered loaded extension now:

- admits canonical schemaVersion 1 public contracts with legacy decoding disabled;
- declares bounded executable input/output schemas, standard effects, and truthful traits;
- atomically installs exact provide-name bindings under an owned lease;
- disposes registrations during shutdown;
- keeps prompts, tool allowlists, model policy, grants, and continuation limits in private profiles where agents are used;
- omits caller identity, trace authority, confirmation, deadlines, and model deployment policy from model input;
- generates deterministic digest-stamped contract types;
- passes executable package conformance against the portable v2 artifact.

Dynamic Pi-PE generated pipelines use admitted canonical contracts and generation-pinned `ProtocolRegistration.replace()` rather than unregister/register replacement.

The migrated repositories and final portable-release commits are:

| Package | Commit |
| --- | --- |
| pi-td/todo | `e43c71c` |
| pi-toolkit | `d7be401` |
| pi-sxng | `9322bbf` |
| pi-pi | `5d49fcb` |
| pi-dev | `e6a97e1` |
| pi-fi | `88c0c28` |
| pi-pe | `2061cdd` |
| pi-cron | `def7b66` |
| pi-ng / pi-ngv2 | `14fa2aa` |
| pi-full-session | `a2634d5` |

## Consequences

- Static conformance recursively reports ten passing loaded extension packages.
- Package copies are independent of repository layout and local symlinks.
- Private deployment details no longer drift into public discovery.
- Host confirmation, attenuation, causal provenance, and session ownership remain authoritative across extension boundaries.
- npm registry publication may mirror the same artifact later, but ecosystem correctness does not depend on a machine-local registry credential.
