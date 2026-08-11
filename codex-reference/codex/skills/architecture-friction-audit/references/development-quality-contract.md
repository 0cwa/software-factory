# Development-Quality Contract

`development-quality-case@1.0.0` records why an intervention exists, what options were compared, its blast radius, preserved behavior, focused validation, deferrals, blockers, and next action.

Complete cases require concrete trigger evidence, a settled `proceed`, `defer`, or `no-change` decision, a valid selected option for `proceed`, no blocking blocker, and every preservation and validation gate either passed or explicitly not applicable. A command exit alone is not gate evidence.

Use namespaced extensions for domain records. Extensions may refine asset classifications, upstream delta, thin-slice scoring, or browser capability details but must not redefine shared decision, blast-radius, preservation, or validation semantics. Incompatible changes require a new major version or compatibility layer.
