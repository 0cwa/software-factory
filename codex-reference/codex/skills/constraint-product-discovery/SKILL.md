---
name: constraint-product-discovery
description: Find purchasable products that satisfy explicit material, compatibility, location, availability, and other hard constraints; verify each claim from primary listings or technical documents, reject near-matches, and label unknowns. Use for exact-item shopping or supplier discovery where substitutions are unacceptable. Do not use for general recommendations, price-only comparisons, procurement execution, or unconstrained web search.
---

# Constraint Product Discovery

Return only verified matches. A plausible, popular, or similar item is not a qualifying result.

## Establish constraints

Read [Constraint verification](references/constraint-verification.md) and the shared [Claim-evidence contract](../evidence-decision-research/references/claim-evidence-contract.md). Use [Product Discovery Case Template](assets/product-discovery-case.template.json) for a traceable candidate set; validate it with `../evidence-decision-research/scripts/validate_claim_evidence.py ARTIFACT`.

Translate the request into hard gates and ranked preferences. Preserve exact distinctions such as material composition, model or interface compatibility, seller region, shipping destination, pack size, condition, price basis, and in-stock status. Ask only when ambiguity could change which products qualify.

## Discovery workflow

1. Record each hard constraint and preference independently, including acceptable proof and the checked-at requirement for volatile facts.
2. Search broadly for candidates, then verify narrowly. Prefer manufacturer pages, technical data sheets, authorized seller listings, and direct retailer stock pages.
3. Create one claim per candidate-constraint pair. Link the exact source location; do not infer a material or compatibility property from branding, category, or a similar model.
4. Mark each constraint `pass`, `fail`, or `unknown`. Reject a candidate on any hard failure; keep incomplete candidates out of the qualifying set.
5. Maintain a near-miss log so rejected products cannot drift back into recommendations. Explain the failed or unknown gate concisely.
6. Rank only qualifying candidates using preferences such as price, delivery, warranty, or seller confidence. Normalize taxes, shipping, quantities, and currencies before comparing totals.
7. Recheck availability, price, and regional delivery immediately before reporting when those facts affect qualification.

## Hard gates

- Never substitute a related material, connector, model, region, or size without explicit user permission.
- Never treat a search snippet, marketplace title, or third-party summary as sufficient proof of a hard technical constraint when primary evidence is available.
- Never label an item available without a source and checked-at time.
- Never rank an unknown candidate among verified matches.
- Never purchase, reserve, message a seller, create an account, or disclose user data without explicit authority.
- State when no verified match exists; do not soften constraints to manufacture a result.

## Result

Return normalized constraints, qualifying options with direct proof and checked-at times, rejected near-matches with failed gates, unknown candidates, normalized comparison fields, coverage gaps, and the smallest follow-up check.
