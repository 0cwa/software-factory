# Evidence-First Troubleshooting

Build a layer map before changing policy: application, packaging, runtime, container or sandbox, user session, systemd unit, SELinux, user namespaces, kernel, firmware, hardware, and upstream compatibility. Record the exact failing operation, current deployment, reproducibility, logs, and the narrowest control that could affect it.

Test discriminating hypotheses with read-only inspection and the smallest reproducible workload. A failure that survives removal of custom container restrictions is evidence against weakening those restrictions. A successful enumeration or startup check is not proof that real compute, I/O, or integration works.

For mutable release details, verify current secureblue and relevant upstream primary sources. Separate observed local facts, source-backed claims, and proposed mitigations. Compare workarounds by scope, security cost, rollback, and evidence. Prefer no-change when the proposed relaxation does not explain the failure.

Before apply, use the safe-change workflow: exact target and deployment, before state, command plan, side-effect analysis, scoped authority, postcondition, security audit, reboot implications, and rollback deployment or command.
