# Software Factory product root

`.pi/factory/` is the tracked product control-plane root. Future committed workflow definitions, contracts, prompts, and reviewed durable evidence belong here.

Runtime-owned execution state belongs under `.pi/factory/runtime/`. That directory is intentionally ignored and is not a source of product authority; see [ADR-0001](../../docs/adr/0001-product-authority-and-reference-boundary.md).

The workspace currently contains the deployable `@kybernetria/software-factory` package scaffold. Its entry point and CLI are placeholders only; domain contracts, workflow, runtime, Protocol integration, and CLI behavior are intentionally deferred.
