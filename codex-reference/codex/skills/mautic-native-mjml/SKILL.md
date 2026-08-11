---
name: mautic-native-mjml
description: "Use for Mautic-native MJML email themes and GrapesJS-compatible email templates, including import, save, and reopen reliability."
---

# Mautic Native MJML

## Operating Stance

Target Mautic's GrapesJS edit/save/reopen lifecycle, not only MJML validity or compiled HTML. Prefer boring, explicit, structurally regular MJML that Mautic can import, reserialize, save as custom MJML/editor state, and reparse after reopening.

Default to complete MJML documents in `email.html.twig` for current Mautic. Older Mautic docs and code still mention `html/{objectType}.mjml.twig` or `email.mjml.twig`, but Mautic 7 marks that path deprecated and detects MJML by rendered output containing `<mjml>`.

Use only patterns that remain editable unless the user explicitly asks for a non-editable compiled artifact.

## Mautic-Safe MJML Profile

Before handing over MJML, check:

- Full document: `<mjml><mj-head>...</mj-head><mj-body>...</mj-body></mjml>`.
- Theme file: prefer `email.html.twig` containing MJML for current Mautic themes.
- Structure: `mj-body` contains `mj-section`; sections contain `mj-column`; columns contain content components.
- Explicit closing tags for all MJML components, especially `mj-image`, `mj-divider`, `mj-font`, and `mj-spacer`.
- Direct critical styles on components. Treat `mj-class` and `mj-attributes` as Mautic-version-sensitive.
- Mautic tokens preserved literally, with no escaping, interpolation, or HTML entity damage.
- Theme assets use `{{ getAssetUrl('themes/'~template~'/assets/file.png', null, null, true) }}`.
- Editable content avoids `mj-raw`, arbitrary HTML islands, and complex Twig control flow.
- Lists inside `mj-text` are simple and retested after reopen.
- Components are Mautic-tested unless the user accepts verification risk.

## Component Guidance

Prefer Mautic-tested body components: `mj-button`, `mj-column`, `mj-divider`, `mj-image`, `mj-navbar`, `mj-section`, `mj-spacer`, and `mj-text`.

Use normal head components when needed: `mj-breakpoint`, `mj-font`, `mj-html-attributes`, `mj-style`, `mj-title`, and `mj-preview`. Keep `mj-head` conventional, but do not depend on exact head serialization surviving every builder edit cycle.

Avoid exotic MJML components such as carousel or accordion unless tested in the exact Mautic builder version and target email clients.

## Styles And Theme Tokens

Critical rendering styles belong directly on the MJML component. This includes button colors, widths, padding, text sizes, alignments, image dimensions, and section backgrounds.

Use `mj-class` only when targeting and testing Mautic 7's GrapesJS MJML theme-token behavior. Mautic 7 default conventions are:

- Text: `t-body`
- Primary button: `t-btn t-btn-primary`
- Secondary button: `t-btn t-btn-secondary`
- Section: `t-section t-surface-1`

Do not present these as universal MJML classes. They are Mautic 7 theme-token conventions that require matching `mj-class` definitions in `mj-head`.

## Tokens And Links

Preserve Mautic tokens as literal text:

- Contact fields: `{contactfield=firstname}`, `{contactfield=firstname|friend}`
- System URLs/text: `{webview_url}`, `{unsubscribe_text}`, `{unsubscribe_url}`, `{resubscribe_url}`, `{dnc_url}`
- Tracking: `{tracking_pixel}`
- Disable tracking on a link: `mautic:disable:tracking="true"`

Keep unsubscribe and webview links in simple `mj-text` or `mj-button` markup. Do not wrap token URLs in Twig expressions.

## Anti-Patterns

Reject or rewrite these unless the user explicitly accepts the Mautic builder risk:

- Self-closing MJML tags: `<mj-spacer />`, `<mj-image />`, `<mj-divider />`, `<mj-font />`.
- `mj-raw` as an editable pattern. Mautic removes the raw block from the editor because it is not usable.
- Complex Twig inside editable regions, loops around MJML structure, conditional tag fragments, and Twig-generated closing tags.
- Arbitrary HTML nesting inside `mj-body`, `mj-section`, or `mj-column`.
- Untested MJML components, custom components, or raw HTML islands.
- Relying on `mj-attributes` or `mj-class` for critical rendering styles without Mautic-version testing.
- Malformed hierarchy: nested `mj-section` inside `mj-column`, content directly under `mj-body`, columns outside sections, or unbalanced tags.
- Depending on exact preservation of `mj-head` order, whitespace, or generated list-style CSS.

## Validation Workflow

Use this workflow for any theme or important editable email:

1. Compile with MJML and fix all MJML errors.
2. Load the theme/email in Mautic GrapesJS.
3. Edit representative content: text, image, button, list, footer, and token links.
4. Save.
5. Reopen in GrapesJS.
6. Confirm MJML structure, Mautic tokens, `getAssetUrl` assets, list styles, buttons, and unsubscribe/webview links survived.
7. Send a Mautic test email and inspect major email clients when possible.

## Source Refresh

When exact Mautic behavior matters, re-check the target Mautic branch before finalizing. The highest-signal files are `GrapesJsController.php`, `builder.service.js`, `grapesjs-mjmlThemeTokens/index.js`, `grapesjs-mjmlThemeTokens/utils.js`, `mjmlStyles.service.js`, and `GrapesJsBuilderModel.php` under `plugins/GrapesJsBuilderBundle`.

## References

Read [Patterns And Examples](references/patterns.md) when creating or repairing an email. It contains the base `email.html.twig` template, header/body/image/button/footer snippets, token-safe unsubscribe/webview block, asset pattern, and review checklist.
