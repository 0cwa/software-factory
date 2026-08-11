# pi-dev

A Pi extension exposing five canonical protocol contracts backed by private software-development agents:

- `pi_dev.scout` — fast read-only exploration
- `pi_dev.architect` — read-only analysis and planning
- `pi_dev.worker` — direct implementation and tests in the host session working directory
- `pi_dev.reviewer` — source-read-only review with constrained commands
- `pi_dev.security_reviewer` — source-read-only threat and security review

There is intentionally no hidden orchestrator or worktree manager. Callers discover and compose roles through protocol contracts.

## Invoke

Use the generic protocol tool’s single call shape:

```json
{"op":"call","target":"pi_dev.scout","input":{"task":"Locate the token refresh flow","scope":["src"],"questions":["Where is renewal started?"]}}
```

```json
{"op":"call","target":"pi_dev.worker","input":{"task":"Implement token refresh","plan":["Add flow","Add tests"],"acceptanceCriteria":["Tests pass"]}}
```

Host code should use a host-minted principal and attenuated grant:

```ts
const principal = fabric.mintPrincipal("workflow:development", "agent");
const result = await fabric.invokeAs(principal, "pi_dev.architect", {
  task: "Plan the change",
}, {
  grant: { targets: ["pi_dev.architect", "pi_dev.scout"], maxDepth: 4, maxInvocations: 16 },
});
```

Caller identity, correlation, model choice, thinking level, deadline, confirmation, and registration generation are not model input fields.

## Contract and deployment

`pi.protocol.json` is a canonical schemaVersion 1 public contract containing only node/provide descriptions, bounded schemas, effects, and traits. Every object schema rejects undeclared fields.

Private `pi.agents.json` owns:

- contained prompt files
- exact Pi tool allowlists
- model class/specific model and thinking policy
- attenuated protocol access (`architect`, `worker`, and reviewers may call only `pi_dev.scout`)
- bounded continuation TTL and session counts

The extension admits both files, creates SDK executors with `createPiSdkAgentExecutorsFromProfiles()`, and atomically installs exact provide-name bindings through `fabric.install()`. Public discovery never reveals the private profiles.

## Safety

- Every role uses the standard profile-backed session factory and the host session working directory.
- Scout has only `read`, `grep`, `find`, and `ls`.
- Architect adds only the `protocol` tool with scout-only authority.
- Worker adds mutation and shell tools; it is the only file-writing role.
- Reviewers have read tools plus `bash` for inspection and test commands, but no edit or write tools.
- Session resources follow the normal Pi SDK factory; Pi-Dev does not maintain a custom child-session runtime.
- Cancellation reaches child sessions; non-cooperative outcomes remain unknown rather than being falsely reported terminal.
- Prompt/response sizes are bounded and truncation is diagnosed.
- Output is strict schema-compatible JSON without presentation data.

Project tests and worker tasks can execute repository code. Use trusted repositories.

## Host configuration

Model and thinking policy are fixed by the admitted private profiles; model input cannot override deployment policy. Prompt and response bounds use `PI_DEV_MAX_PROMPT_CHARS` and `PI_DEV_MAX_RESPONSE_CHARS`.

## Development

```bash
npm install
npm run protocol:generate
npm run protocol:check
npm run typecheck
npm test
git diff --check
```

To add a role, add request/output types and role shaping, a public provide contract, a private profile/prompt, an exact executor binding, and focused admission, authority, cancellation, schema, telemetry, and session tests.
