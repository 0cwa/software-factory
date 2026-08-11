# Claim-Evidence Contract

`claim-evidence-case@1.0.0` is the canonical cross-domain record for decision research, review verification, and exact-constraint discovery. Keep repository, provider, retailer, and domain semantics in namespaced extensions.

## Lifecycle

Use `draft → researching → synthesizing → complete`. Enter `blocked` when the next material check requires missing input or authority. Completion requires settled questions, counterevidence review, source-linked material claims, a non-pending conclusion, and no blocking unknown.

## Claims and evidence

Give each question, claim, source, and evidence link a stable ID. A source record identifies the publisher, locator, retrieval time, source type, freshness, and a short paraphrased summary. An evidence link connects one source to one claim as support, contradiction, or context and records exact location, directness, strength, and reasoning.

Keep observations and source statements separate from inference. Confidence belongs to the claim and conclusion, not to the prestige of a source. Multiple secondary sources repeating the same upstream statement do not become independent confirmation.

## Primary-source and freshness gates

Set `primary_evidence_required` and `freshness_required` per claim. A completed case needs direct supporting or contradicting evidence from a primary or observed source for every claim whose primary gate is true. Freshness-gated claims need current evidence. Record a claim-specific policy exception only when the preferred evidence is unavailable and explain the limitation in the result.

For volatile facts—versions, prices, stock, shipping, schedules, policies, APIs, or current code—record retrieval time and recheck near delivery. Do not reuse an old case without reassessing freshness.

## Counterevidence and unknowns

Set `counterevidence_checked` only after looking for disqualifying facts or competing explanations. Use `mixed`, `refuted`, or `unknown` instead of forcing a binary verdict. Every blocking or material unknown names its impact and smallest next check.

## Extensions

- `extensions["evidence-review.decision"]` carries compared options and the selected option.
- `extensions["evidence-review.review"]` carries finding dispositions, actions, and validation references.
- `extensions["evidence-review.discovery"]` carries hard and preferred constraints plus per-candidate constraint results.

Extensions may add domain fields but must not redefine claim identity, source identity, evidence direction, freshness, confidence, or conclusion semantics. Incompatible changes require a new major version or compatibility layer.
