# Taste-to-Token Map

Use this mapping during the Manifest phase when user language is abstract.

## Emotion to Typography

- `premium`, `luxury`, `high-end`
  - Heading: geometric/serif hybrid or clean humanist sans in larger scale
  - Body: stable sans with slightly looser line-height (1.35-1.4)
  - Rhythm: wider margins, stronger section breathing room

- `editorial`, `magazine`, `magazine-like`
  - Heading: serif or modern transitional body
  - Body: high-legibility sans, slightly reduced contrast for body, strong first-line contrast in leads
  - Rhythm: open white space, subtle horizontal rule separators

- `bold`, `confident`, `startup`, `VC memo`
  - Heading: condensed sans, larger x-height
  - Body: compact sans, tighter line-height (1.25-1.3)
  - Rhythm: clear section depth, repeatable callout banding

- `friendly`, `welcoming`, `human`
  - Heading: rounded sans, softer weight scale
  - Body: standard sans with warmer tone colors
  - Rhythm: moderate spacing, clearer note styling with visual warm accents

- `technical`, `engineering`, `data`
  - Heading: neutral sans
  - Body: sans + optional monospace in metric/code snippets
  - Rhythm: compact tables, predictable grid, tight label-to-value spacing

## Emotion to Color Direction

- `minimal`: neutral grays + one accent color, low saturation
- `energetic`: accent pair from warm secondary hue, deeper contrast pairings
- `trustworthy`: muted blues/charcoals with calm muted accents
- `organic`: olive/cream/beige accents and slightly softer dark text

## Emotion to Spacing

- `airy`: section gaps +1.5x baseline, generous paragraph spacing
- `tight`: reduced margins and tighter paragraph spacing for shorter docs
- `balanced`: Word default rhythm with refined custom deltas (baseline)

## Layout tokens with recommended semantic names

- `section_title`, `section_body`, `section_footer`
- `hero_lead`, `kpi_callout`, `insight_box`, `note_box`, `code_snippet`
- `table_title`, `table_header`, `table_row_even`, `table_row_odd`
- `payment_terms_block`, `disclaimer_small`, `figure_caption`
