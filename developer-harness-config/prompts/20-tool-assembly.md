# Issue-Specific Tool and Harness Assembly

Use this when preparing a work unit. The goal is the minimum reviewed, least-privilege environment that satisfies the issue—not the largest available tool catalogue.

## Inputs

Derive a typed need set from:

- exact issue scope, non-goals, and acceptance criteria;
- repository/language/toolchain and source types;
- planned phases: research, inspect, design, implement, test, review, security, package, PR;
- required filesystem/process/network/GitHub/Protocol/model effects;
- platforms and fixtures;
- source mode: release, exact commit, sibling workspace, offline artifact;
- time, token, cost, retry, concurrency, and storage budgets;
- protected/forbidden operations;
- current Foundry environment observation.

Issue/model prose may suggest capabilities. It cannot authorize packages, scripts, effects, credentials, or global mutation.

## Capability-first needs

Express needs as capabilities with constraints. Examples:

```text
workflow.software-factory
workspace.git-worktree
protocol.invocation
role.repository-scout
role.software-architect
role.code-worker
role.code-reviewer
role.security-reviewer
quality.node-typescript
source.github-read
source.github-draft-pr-write
source.npm-registry-read
research.web-primary-sources
artifact.content-addressed
```

Map capabilities to reviewed providers only after inspection. Do not hard-code “Fabric/Taskplane/Pi-PE is always needed.”

## Preparation sequence

1. **Inspect**
   - call Foundry inspect/status/doctor;
   - record exact current Foundry lock, Pi/Node/package/provider identities, loaded state, incomplete transactions/runs, and relevant unmanaged global state.
2. **Validate existing environment**
   - check whether required capabilities already have compatible reviewed providers;
   - confirm selected `development.workflow` is Factory or the issue-approved alternative;
   - confirm exact Provider/Protocol contracts and phase tool allowlists;
   - produce a no-op verification receipt if sufficient.
3. **Resolve missing needs**
   - query the curated catalogue and evidence;
   - choose the minimum reviewed provider set;
   - resolve versions/sources to exact artifacts/commits/digests;
   - prefer project-local scope and preserve unmanaged global state;
   - select optional providers only for phases that need them.
4. **Preview**
   - show package/source/settings/filter/script/tool/permission/storage/reload/rollback changes;
   - show alternatives, unknowns, evidence age, and why each provider is needed;
   - group new/global/PATH/shell/script/secret/destructive/authority changes separately.
5. **Approve/apply**
   - obtain the exact applicable approval;
   - apply only through Foundry transactions;
   - never run issue/model-provided install commands.
6. **Verify/reload**
   - verify package integrity, provider contracts, workflow graph, tools, worktree/process/evidence adapters, and conflict-free authority;
   - reload/restart where classified;
   - record the environment receipt/lock digest.
7. **Bind/attenuate**
   - bind the Factory work unit to the receipt;
   - phase runtime grants are no broader than the approved environment;
   - re-inspect before effectful phases and stop on material drift.

## Phase-specific exposure

Installation and model-visible exposure are separate.

- An installed provider can remain inactive or unavailable to a phase.
- A role receives only the tools/capabilities needed by its exact phase.
- Full package/skill/tool catalogues are not injected into prompts.
- Context functions retrieve compact contracts/instructions lazily.
- Extension/custom tools must be explicitly allowed, not assumed visible because the extension loaded.
- Reviewer/security roles are read-only unless a separate workflow explicitly targets an approved artifact.

## Default provider strategy

For routine Software Factory work:

```text
development.workflow: software-factory
capability authority: pi-protocol
roles: pi-dev
fixed subpipelines: direct Protocol first; Pi-PE only for an evaluated variant
parallel delegated executor: none by default; Taskplane subordinate only when reviewed
programmable tool gateway: explicit optional Fabric use
```

A Foundry issue may require Foundry standalone recovery/transaction tools. A Factory issue normally uses Factory plus Protocol/Pi-Dev. Cross-platform or security issues add only the corresponding deterministic fixtures/reviewer capabilities.

## Common profiles

Profiles in `toolsets/capability-needs.jsonc` are transparent defaults:

- `typescript-core-change`;
- `cross-platform-filesystem-change`;
- `protocol-provider-integration`;
- `security-sensitive-change`;
- `documentation-only`;
- `research-and-roadmap`;
- `self-hosting-factory-foundry-change`.

Always show their exact expansion and final delta.

## Stop conditions

Stop before Factory implementation when:

- a required capability has no reviewed eligible provider;
- source/artifact identity or lifecycle scripts are unknown;
- a provider conflict creates two top-level workflow authorities;
- an incomplete Foundry transaction or Factory run makes change unsafe;
- global/secret/permission/authority changes lack approval;
- credentials/external access are unavailable;
- the selected source changed after proposal;
- reload/restart/verification failed;
- the environment receipt cannot truthfully establish the required capability.

Do not substitute an unreviewed package or broaden an existing agent's shell/tool access to avoid these boundaries.

## Cleanup

Issue-specific environment changes are not automatically removed after the run. Other work may depend on them. Foundry audit/update/repair/remove produces a later explicit proposal with current usage and incomplete-run checks.
