# Patterns And Examples

## Base `email.html.twig`

Use this as the starting point for current Mautic themes. Keep the MJML complete and explicit.

```twig
<mjml>
  <mj-head>
    <mj-title>{{ template|default('Mautic email') }}</mj-title>
    <mj-preview>Hello {contactfield=firstname|friend}, here is an update for you.</mj-preview>
    <mj-breakpoint width="600px"></mj-breakpoint>
    <mj-font name="Inter" href="https://fonts.googleapis.com/css?family=Inter:400,600,700"></mj-font>
    <mj-style>
      .footer-link a { color: #5b6472; text-decoration: underline; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#f3f5f8" width="600px">
    <mj-section background-color="#ffffff" padding="24px 28px 12px 28px">
      <mj-column>
        <mj-image
          src="{{ getAssetUrl('themes/'~template~'/assets/logo.png', null, null, true) }}"
          alt="Company"
          width="140px"
          padding="0px"
        ></mj-image>
      </mj-column>
    </mj-section>

    <mj-section background-color="#ffffff" padding="12px 28px 28px 28px">
      <mj-column>
        <mj-text font-family="Inter, Arial, sans-serif" font-size="16px" line-height="24px" color="#1f2937" padding="0px">
          Hello {contactfield=firstname|friend},
        </mj-text>
        <mj-spacer height="16px"></mj-spacer>
        <mj-text font-family="Inter, Arial, sans-serif" font-size="16px" line-height="24px" color="#1f2937" padding="0px">
          Replace this paragraph with campaign-specific copy. Keep editable text inside simple mj-text components.
        </mj-text>
        <mj-spacer height="24px"></mj-spacer>
        <mj-button
          href="https://example.com"
          background-color="#2563eb"
          color="#ffffff"
          font-family="Inter, Arial, sans-serif"
          font-size="16px"
          font-weight="700"
          border-radius="4px"
          inner-padding="14px 22px"
          padding="0px"
        >Primary action</mj-button>
      </mj-column>
    </mj-section>

    <mj-section background-color="#edf0f4" padding="18px 28px">
      <mj-column>
        <mj-text css-class="footer-link" font-family="Arial, sans-serif" font-size="12px" line-height="18px" color="#5b6472" align="center" padding="0px">
          <a href="{webview_url}" mautic:disable:tracking="true">View in browser</a>
          &nbsp;|&nbsp;
          <a href="{unsubscribe_url}" mautic:disable:tracking="true">{unsubscribe_text}</a>
        </mj-text>
        <mj-text font-family="Arial, sans-serif" font-size="12px" line-height="18px" color="#5b6472" align="center" padding="8px 0px 0px 0px">
          {tracking_pixel}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

## Header

```twig
<mj-section background-color="#ffffff" padding="24px 28px">
  <mj-column>
    <mj-image
      src="{{ getAssetUrl('themes/'~template~'/assets/logo.png', null, null, true) }}"
      alt="Company"
      width="132px"
      align="left"
      padding="0px"
    ></mj-image>
  </mj-column>
</mj-section>
```

## Body Section

```twig
<mj-section background-color="#ffffff" padding="8px 28px 28px 28px">
  <mj-column>
    <mj-text font-family="Arial, sans-serif" font-size="20px" line-height="28px" font-weight="700" color="#111827" padding="0px 0px 12px 0px">
      A clear editable heading
    </mj-text>
    <mj-text font-family="Arial, sans-serif" font-size="16px" line-height="24px" color="#374151" padding="0px">
      Keep paragraphs simple. Mautic tokens such as {contactfield=firstname} should remain literal.
    </mj-text>
  </mj-column>
</mj-section>
```

## Image

```twig
<mj-image
  src="{{ getAssetUrl('themes/'~template~'/assets/hero.jpg', null, null, true) }}"
  alt="Descriptive image alt text"
  width="544px"
  padding="0px"
></mj-image>
```

## Button

```twig
<mj-button
  href="https://example.com/offer"
  background-color="#2563eb"
  color="#ffffff"
  font-family="Arial, sans-serif"
  font-size="16px"
  font-weight="700"
  border-radius="4px"
  inner-padding="14px 22px"
  padding="0px"
>Open offer</mj-button>
```

For an untracked Mautic link:

```twig
<mj-button
  href="{unsubscribe_url}"
  mautic:disable:tracking="true"
  background-color="#4b5563"
  color="#ffffff"
  font-size="14px"
  border-radius="4px"
>Unsubscribe</mj-button>
```

## Footer And Required Links

```twig
<mj-section background-color="#f3f5f8" padding="18px 28px">
  <mj-column>
    <mj-text font-family="Arial, sans-serif" font-size="12px" line-height="18px" color="#5b6472" align="center" padding="0px">
      <a href="{webview_url}" mautic:disable:tracking="true">View in browser</a>
      &nbsp;|&nbsp;
      <a href="{unsubscribe_url}" mautic:disable:tracking="true">{unsubscribe_text}</a>
      &nbsp;|&nbsp;
      <a href="{resubscribe_url}" mautic:disable:tracking="true">Resubscribe</a>
    </mj-text>
    <mj-text font-family="Arial, sans-serif" font-size="12px" line-height="18px" color="#5b6472" align="center" padding="8px 0px 0px 0px">
      {tracking_pixel}
    </mj-text>
  </mj-column>
</mj-section>
```

## List Styling

Mautic normalizes list styles from `li` and same-style nested spans into generated `<mj-style data-gjs-list-styles="true">` rules. Only these properties are handled: `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `line-height`, `letter-spacing`, `text-transform`, and `text-decoration`.

Prefer this:

```twig
<mj-text font-family="Arial, sans-serif" font-size="16px" line-height="24px" color="#374151" padding="0px">
  <ul>
    <li>One simple benefit</li>
    <li>Another simple benefit</li>
  </ul>
</mj-text>
```

Avoid heavily nested styled spans inside lists. Always reopen and inspect list styling after saving.

## Mautic 7 Theme Token Example

Use only when the target theme defines these `mj-class` names and the email will be tested in Mautic 7 GrapesJS.

```twig
<mj-head>
  <mj-attributes>
    <mj-class name="t-body" font-family="Arial, sans-serif" font-size="16px" line-height="24px" color="#374151"></mj-class>
    <mj-class name="t-btn" font-family="Arial, sans-serif" font-size="16px" font-weight="700" border-radius="4px"></mj-class>
    <mj-class name="t-btn-primary" background-color="#2563eb" color="#ffffff"></mj-class>
    <mj-class name="t-section" padding="24px 28px"></mj-class>
    <mj-class name="t-surface-1" background-color="#ffffff"></mj-class>
  </mj-attributes>
</mj-head>
```

Even with token classes, keep critical styles direct when the exact Mautic version is unknown.

## Review Checklist

- No self-closing `mj-image`, `mj-divider`, `mj-font`, or `mj-spacer`.
- No `mj-raw` in editable content.
- No complex Twig blocks inside editable body regions.
- All image URLs use `getAssetUrl` for theme assets.
- All Mautic tokens remain literal and unescaped.
- Sections, columns, and content components are properly nested.
- Unsubscribe, webview, DNC, resubscribe, and tracking pixel tokens are present where required by the email type.
- MJML compiles, imports into GrapesJS, survives edit/save/reopen, and sends as a test email.
