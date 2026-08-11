# Integration and validation

Read this only for code integration, commit design, or validation-depth decisions.

## Integration order

1. Reinspect the current diff and repository state.
2. Verify each returned change is within its assigned scope.
3. Integrate dependencies before their consumers.
4. Resolve semantics centrally; do not accept conflict markers or generated output blindly.
5. Run the smallest test that can reject the change quickly.
6. Expand to related suites, static checks, packaging, or end-to-end paths in proportion to risk.
7. Record exact commands, outcomes, and known coverage gaps as evidence.

## Acceptance and review

Independent review should inspect current code and observable behavior. When supplied findings are being verified, consume the vocabulary owned by `verify-review-findings`: `valid`, `stale`, `intentional`, `duplicate`, or `unclear`. Use `unresolved` for a blocking decision or missing authority, never as a serialized finding disposition. A review request does not make a claim true.

Return a unit to `active` when review finds a valid issue. Move it to `verified` only after all gates pass. If a test cannot run, record the blocker or coverage gap; do not turn absence of evidence into a pass.

## Change-set discipline

Group commits by coherent behavior and acceptance evidence, not by agent or elapsed time. Exclude temporary ledgers and private planning artifacts unless the user wants them versioned. Do not commit or push merely because a stage completed; require authority from the active task.
