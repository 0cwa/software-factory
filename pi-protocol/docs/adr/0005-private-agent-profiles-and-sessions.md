# ADR 0005: Private agent profiles and bounded continuation sessions

Status: accepted

## Context

Public capability contracts must not publish prompts, model deployment choices, tool lists, or private agent authority. The legacy v0.2 manifest mixed those concerns and the SDK adapter inferred whether callbacks were factories from `Function.length`. Its process-global string-keyed session map was collision-prone, unbounded, and raced concurrent continuation calls.

## Decision

Canonical public manifests remain implementation-neutral. Optional `pi.agents.json` files are admitted separately through a strict, bounded v1 profile parser. Profiles contain prompt file paths, tools, model policy, protocol grants, and continuation limits. Prompt files are resolved below an explicit real base directory and their contents never enter the protocol definition or registry.

`createPiSdkAgentExecutorsFromProfiles()` binds private profile names to public provide names with explicit per-agent factories. Legacy callback-shape inference is removed; compatibility options distinguish shared callbacks from `*ByAgent` callbacks by name. The protocol-awareness prompt is injected only when the profile makes the protocol tool available.

Each executor owns a bounded continuation cache. Keys are structured tuples of executor, host principal, target, pinned contract digest, and opaque session ID. Creation is atomic, prompts for one key are serialized, and replacement, end, abort, expiry, LRU eviction, or shutdown disposes sessions. Concrete model overrides are deployment inputs; public discovery does not reveal them.

The current invocation control state is explicitly bridged into SDK protocol-tool execution and attenuated by the private profile grant. This preserves principal, grant, causal, cancellation, and deadline authority across the Pi SDK callback boundary.

## Consequences

Profile deployment is private and host-specific. Session continuation is deterministic and bounded but intentionally local to one executor process; it is not durable transport state. Hosts must call the exported shutdown disposer, although retained entries also expire and eviction is self-disposing. Legacy manifest agents remain migration-only.
