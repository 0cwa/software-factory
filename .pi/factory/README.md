# Software Factory product root

`.pi/factory/` is the tracked product control-plane root. Future committed workflow definitions, contracts, prompts, and reviewed durable evidence belong here.

Runtime-owned execution state belongs under `.pi/factory/runtime/`. That directory is intentionally ignored and is not a source of product authority; see [ADR-0001](../../docs/adr/0001-product-authority-and-reference-boundary.md).

SF-0 establishes this boundary only. It does not add package code or runtime behavior.
