---
name: agent-browser-validation
description: Design and run the lightest browser test environment agents can operate for real acceptance paths, including isolated identities, multi-user flows, extensions, and local-first behavior; capture reproducible evidence beyond page-load checks. Use when agents need to test an app themselves, two independent browsers are required, or a browser or extension path lacks runnable validation. Do not use for unit tests, manual-only QA plans, generic container setup, or full browser infrastructure without a concrete acceptance gap.
---

# Agent Browser Validation

Close a specific human-only acceptance gap with the lightest controllable browser setup.

## Workflow

Read the shared [Development-quality contract](../architecture-friction-audit/references/development-quality-contract.md) and [Browser capability design](references/browser-capability-design.md). Start from the shared [Case Template](../architecture-friction-audit/assets/development-quality-case.template.json) and add [Browser Extension](assets/browser-extension.template.json).

1. State the user-visible path that cannot currently be validated and the failure a page-load check would miss.
2. Inventory the required browser capabilities: engine, extension loading, profiles, isolated identities, permissions, storage, networking, clipboard, downloads, media, and observability.
3. Compare existing automation, clean profiles, two local browsers, and isolated containers or VMs. Choose the smallest setup that reproduces the path reliably.
4. Create deterministic fixtures and separate identities. Record setup, cleanup, ports, test data, and concurrency boundaries.
5. Automate the critical path with assertions on behavior and cross-browser state, not just rendering or HTTP success.
6. Capture screenshots only where visual state matters; also collect console, network, application, and synchronization evidence needed to diagnose failures.
7. Prove failure sensitivity with one controlled negative or known-bad condition. Feed reproducible failures back to implementation and rerun focused checks.

## Hard gates

- Never add containers or browsers without tying them to a missing acceptance capability.
- Never reuse linked identities when isolation is part of the behavior under test.
- Never declare success from page load, screenshot presence, or command exit alone.
- Never store credentials or persistent personal browser data in fixtures or evidence.
- Never claim an extension or multi-user flow was tested when the environment bypassed its real permissions, storage, or synchronization boundary.

## Result

Return the acceptance gap, capability matrix, chosen setup and rejected alternatives, isolated fixtures, executable critical path, assertions, evidence bundle, cleanup state, known limitations, and next failing or passing gate.
