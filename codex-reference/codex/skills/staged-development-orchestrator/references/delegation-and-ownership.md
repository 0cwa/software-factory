# Delegation and ownership

Read this only when work may be split across agents or concurrent editors.

## Lane test

Delegate a lane only when it has:

- one outcome and explicit non-goals;
- a bounded read or write surface;
- dependencies that are already complete or read-only;
- observable acceptance evidence;
- an owner and a return contract;
- no unresolved overlap with another mutation lane.

Keep sequential work local when coordination would exceed the work itself. Never require a fixed number of agents or a fixed model.

## Assignment packet

Provide the raw objective, allowed workspace, relevant repository guidance, owned files or concepts, exclusions, authority boundary, required deliverables, acceptance gates, expected evidence, and a `source_exposure` record. Use `mode: task-context` for ordinary assignments. When `provenance-audit-reset` requires clean-room separation, use `mode: sanitized-spec-only`, reference its boundary, and enumerate allowed and restricted inputs.

For `sanitized-spec-only`, give the agent only independently derived requirements and the sanitized specification. Do not include questioned source artifacts, source or patch excerpts, matching text, builder diagnoses, prior contaminated outputs, inherited conversation context, or paths that expose them. If the agent or its workspace has already received restricted material, record that exposure and do not represent the lane as clean-room. The provenance owner defines the boundary; the orchestration owner enforces it without weakening or reinterpreting it.

Require a result containing:

- disposition: complete, partial, blocked, or no-change;
- files or external objects inspected and changed;
- evidence and commands actually run;
- unresolved findings and risks;
- exact integration notes.

## Concurrency rules

- One owner may write a file or shared external object at a time.
- Research lanes may overlap reads but must answer different questions.
- The integration owner resolves conflicts and updates the ledger.
- Serialize commits, pushes, migrations, live mutations, and shared generated artifacts.
- Treat an agent result as evidence to verify, not as an automatic state transition.
