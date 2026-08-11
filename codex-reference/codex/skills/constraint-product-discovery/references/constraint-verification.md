# Constraint Verification

Convert prose requirements into a candidate-by-constraint matrix before ranking products.

## Constraint classes

Hard constraints disqualify an item. Preferences rank only items that pass every hard constraint. Common independent gates include exact material or composition, compatibility and model revision, dimensions, seller or shipping region, new or used condition, pack quantity, price ceiling, lead time, and current availability.

Do not merge adjacent gates. “Sold in Sweden” can mean a Swedish seller, stock physically in Sweden, shipping to Sweden, or a Swedish-language storefront; preserve the user’s actual requirement.

## Acceptable evidence

Use exact manufacturer specifications or data sheets for material and compatibility, and direct seller pages for price, stock, condition, and delivery. A retailer may be primary for its own stock but secondary for technical composition. Search snippets and aggregators are discovery leads, not final proof of a hard gate.

Record the exact relevant section or field and retrieval time. When variants share one page, prove the statement applies to the selected SKU, size, or revision.

## Candidate states

- `qualifies`: every hard constraint passes with evidence.
- `rejected`: at least one hard constraint fails.
- `unknown`: no hard constraint is known to fail, but at least one remains unverified.

Keep rejected and unknown candidates visible in a near-miss log. Never rank either state as a recommendation.

## Comparison normalization

Compare like with like: item count, usable dimensions, taxes, shipping, currency, subscription or bundle requirements, and delivery date. State conversions and do not let a preference override a hard gate.
