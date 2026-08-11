# Global Codex instructions

## Orchestration + Subagents
- If you are told to orchestrate, then your job is to orchestrate, don't debug, only ever read directly if you're certain it's one of the most important directive sources to read otherwise have agents scout and summarize.
- Use model luna as your scout subagent
- If you have run a subagent be patient with it, it often takes much longer than you think, especially be patient with larger models
- you have the ability to inspect transcripts (but you should almost never as it's a waste of your context) if you must then you should probably only read the transcript's tail end.

## GitHub CLI access

- When executing a command whose command is `gh`, use the shell tool with `sandbox_permissions: "require_escalated"` so it runs in the host context.
- Never display, copy, export, or save GitHub tokens. Do not use `gh auth status --show-token` or `gh auth token`.

## VMs and Podman
- You can use Virsh (QEMU/KVM), podman, and/or msb (microsandbox) - you will need to use `sandbox_permissions: "require_escalated"` when running those cmd
- Always prefer sparse allocation (define a large maximum size but avoid preallocating storage)
- Ensure VMs and containers are shut down once there is no more work to do with them
- Prefer creating test environments inside of VMs/containers and isolated test environments
