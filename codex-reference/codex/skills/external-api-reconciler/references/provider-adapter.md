# Provider Adapter

Keep provider behavior outside the safe-change base contract. Verify current semantics from authoritative documentation and read-only probes when permitted.

## Required metadata

Record provider and API version, base endpoint or tenant locator without secrets, credential mechanism and scopes, pagination model, stable identity fields, uniqueness rules, relationship and cascade behavior, mutable and immutable fields, defaults, rate-limit headers, retry semantics, idempotency support, delete and restore behavior, disposable-fixture support, and redaction rules.

## Snapshot completeness

List every page and record page cursors or counts. Follow relationship endpoints needed to detect cascade loss. Treat permission-filtered or partial lists as incomplete unless the API provides a trustworthy completeness signal. Retain a redacted digest and capture timestamp.

## Normalization

Separate absent, null, empty, defaulted, server-generated, and redacted values. Preserve unknown observed fields. Compare canonicalized values but keep raw redacted evidence for diagnosis. Never treat a secret placeholder as a desired replacement value.

## Plan semantics

Assign one stable operation ID per change. Record preconditions, expected effect, idempotency key or strategy, reversibility, and dependent objects. Model replacement sequences explicitly. Deletes and cascade risks require their own approval scope.

## Recovery

Record whether deleted objects can retain IDs, credentials, history, aliases, and relationships. When exact restoration is impossible, disclose that before approval and prefer a reversible cutover strategy.
