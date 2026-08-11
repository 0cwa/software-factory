---
name: evidence-decision-research
description: Research a concrete decision by decomposing questions, gathering current primary evidence and counterexamples, reconciling conflicts, and producing a supported recommendation with confidence and decision impact. Use to compare approaches, verify a recommendation, research before implementation, or run parallel evidence lanes. Do not use for simple factual lookups, generic brainstorming, supplied code-review findings, or product searches governed by exact purchase constraints.
---

# Evidence Decision Research

Turn research into a decision, not a source dump. Keep facts, inferences, unknowns, and proposals visibly separate.

## Establish the case

Read [Claim-evidence contract](references/claim-evidence-contract.md). Create a `claim-evidence-case@1.0.0` artifact from [Case Template](assets/claim-evidence-case.template.json) when traceability matters or several claims determine the outcome. Validate it with `scripts/validate_claim_evidence.py ARTIFACT` before reporting completion.

State the decision, options, disqualifying constraints, included and excluded scope, required freshness, and what evidence could change the decision. Ask for clarification only when a missing choice materially changes the research boundary.

## Research workflow

1. Split the decision into non-overlapping questions. Delegate only independent lanes when parallel work is useful; keep one synthesis owner.
2. Resolve authority before external reads. Prefer current primary sources, official documentation, source code, direct measurements, or reproducible behavior. Record retrieval time for drift-prone facts.
3. Convert material assertions into stable claims. Link each claim to exact source locations and label support, contradiction, directness, and strength.
4. Search for counterexamples and disqualifying evidence. Record conflicts and unknowns instead of averaging them away.
5. Compare options against the same constraints. Separate source-backed facts from inference and proposed judgment.
6. Select an option only when the evidence supports it. Otherwise return an explicit no-decision or blocker and the smallest check that would resolve it.
7. Translate the result into the concrete implementation, product, or architecture decision that should change—or remain unchanged.

## Quality gates

- Do not cite a secondary summary when the relevant primary source is reasonably available.
- Do not call volatile evidence current without a retrieval date and freshness assessment.
- Do not treat lack of confirming evidence as evidence of absence.
- Do not raise confidence while material contradictions or blocking unknowns remain undispositioned.
- Do not let parallel lanes produce competing conclusions; synthesize through one claim matrix.
- Do not infer authority for purchases, remote writes, repository mutations, or other downstream actions from a research request.

## Composition

Use `verify-review-findings` for supplied review claims and `constraint-product-discovery` for purchasable options with hard qualification gates. Domain skills still own domain commands and semantics.

## Result

Return the decision and scope, option comparison, material claims with direct source links, contradictions and counterexamples, freshness notes, unresolved items, recommendation or explicit no-decision, confidence, decision impact, and one next check or action.
