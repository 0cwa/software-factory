---
name: docx-research-compliance
description: Research and verify organization identity, jurisdiction, legal or invoice requirements, source URLs, unsupported claims, and document-type necessity before DOCX styling, planning, editing, or rendering for business, legal, tax, invoice, regulatory, or organization-specific documents.
---

# DOCX Research Compliance

## Progressive disclosure

- Read `references/research-compliance-schema.json` before emitting or validating a final `research_profile`.
- Use this skill before `docx-design-stylist` or `docx-style-planner` when a document depends on current organization identity, addresses, legal entity names, tax IDs, jurisdiction, invoice rules, legal requirements, or document-specific necessity.
- Skip only when the document is purely generic/internal and no organization, legal, tax, regulatory, or invoice facts are needed.

## Research gate

1. Classify `document_type`: `invoice`, `contract`, `proposal`, `report`, `policy`, `letter`, `brief`, or `other`.
2. Identify whether dynamic research is required. It is required for business/legal/org-specific facts unless the user supplies authoritative sources and explicitly says not to browse.
3. Verify facts from primary sources first: official organization sites, public registries, tax authority guidance, court/regulator publications, or user-supplied authoritative documents.
4. Record every material claim with `source_url`, `source_title`, `publisher`, `accessed_at`, and `verified_at`.
5. Mark unverified or conflicting facts in `unsupported_claims`; do not silently convert them into document content.
6. Emit `forbidden_sections` for irrelevant or non-required content. For invoices, default to no signature line unless the user or a source explicitly requires it.

## Invoice necessity contract

For `document_type="invoice"`, the profile must decide and expose:

- one-page default unless user scope or legal/source requirements justify more pages
- contractor/seller identity and client/buyer identity
- invoice number, invoice date, due date, payment terms, and payment method details
- line items, quantities or units when applicable, subtotals, discounts if any, taxes, total due, and currency
- applicable tax/VAT/GST fields and registration identifiers when required by jurisdiction
- forbidden sections such as signature lines, testimonials, marketing copy, generic acceptance blocks, or legal boilerplate unless source/user requires them

## Output

Emit one deterministic JSON object:

```json
{
  "phase": "final",
  "contract": "docx-research-compliance.contract.v1",
  "research_profile": {
    "document_type": "invoice",
    "verified_at": "ISO-8601 timestamp",
    "jurisdiction": {},
    "verified_organization_profile": {},
    "invoice_requirements": {},
    "source_evidence": [],
    "unsupported_claims": [],
    "forbidden_sections": [],
    "document_necessity": {}
  },
  "open_questions": [],
  "confidence": "low|medium|high",
  "handoff": {
    "next_skill": "docx-design-stylist|docx-style-planner",
    "required_contract": "docx-research-compliance.contract.v1"
  }
}
```
