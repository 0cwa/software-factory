# Edit Guidelines

- Prefer exact text replacement over regex unless explicitly requested.
- Do not auto-delete sections without explicit `section_id`.
- For ambiguous matches, mark as skipped and include a follow-up question.
- Use `status="warning"` when replacement count is low and strict mode is disabled.
- Preserve verified organization, legal, invoice, tax, address, payment, and jurisdiction fields unless the user/source explicitly replaces them.
- Do not introduce unsupported claims; add them to `unsupported_claims` instead.
- Do not add invoice signature lines, acceptance blocks, testimonials, or marketing copy unless permitted by source/user.
- If an edit touches a required invoice/legal field, include `factual_fields_touched` and `source_or_user_basis` in the changelog entry.
- Always include the full changelog before handoff.
