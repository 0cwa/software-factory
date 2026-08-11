# ADR 0007: Executable conformance and runtime diagnostics

Status: accepted

## Context

Source-text regex audits could claim that an extension was conformant without proving manifest admission, generated artifact identity, prompt containment, dependency compatibility, or live registration alignment. Nested packages were easy to miss, and runtime operators could not inspect generation, digest, drain, queue, audit, or session health from one bounded report.

## Decision

The package ships three commands and a reusable `/conformance` API:

- `pi-protocol check` recursively or directly admits canonical manifests, checks package identity/dependency compatibility, private profiles and prompt containment, deprecated compatibility, and configured generated artifacts.
- `pi-protocol generate` deterministically emits target constants, exact binding types, input/output aliases, digest headers, and optional catalog JSON. Writes are contained and atomic; `--check` fails on drift.
- `pi-protocol doctor` emits a versioned bounded report covering the host ABI and physical package copies, current and draining owned registrations, generations/digests/source metadata, admission queues, audit/observer health, and SDK session counts. Raw-registration compatibility counters were retired after ecosystem migration.

Recursive discovery is realpath-contained, cycle-safe, deterministic, depth/directory bounded, and finds nested packages. Static checks operate on parsed data rather than source regexes. A registration-time lexical catalog indexes public names, descriptions, tags, effects, and schema property names/descriptions; searches no longer rebuild a full registry snapshot.

The executable CLI is bundled as a Node ESM artifact so package bins work from `node_modules` without a TypeScript loader. CI verifies the bundle, full tests, benchmark ceilings, tarball contents, and isolated installation. The reusable conformance API lets each extension run the same assertions in its own test suite.

## Consequences

Packages opting into generated files declare `package.json#piProtocol.generated`; those files become exact CI-checked derived artifacts while `pi.protocol.json` remains runtime authority. Legacy manifests may be audited with `--allow-legacy` during migration, but canonical check mode fails them. Runtime doctor warnings provide the evidence required before compatibility removal; they are diagnostics, not a security boundary.
