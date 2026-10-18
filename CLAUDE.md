# Porrada email templates

Source of truth for Porrada's transactional email templates. Shopify and Recharge notification editors receive built output from `dist/`; nothing is edited directly in those editors.

## Commands

- `npm run dev` starts the preview at http://localhost:3000 with live reload, fixture switching, and mobile and desktop frames.
- `npm run build` writes paste-ready files to `dist/` and renders every template against every fixture for its platform. A failing render fails the build.

## Structure

- `shared/config.liquid` holds every token: colors, type, spacing, sizes, image URLs, links, and the `st_*` style captures.
- `shared/document-start.liquid` and `shared/document-end.liquid` wrap every email: head, preheader, container, logo, support footer.
- `shopify/` and `recharge/` hold one source file per notification.
- `fixtures/<platform>/` holds mock data, one file per scenario.
- `scripts/` holds the preview server, the build, and the Shopify filter shims.
- `dist/` is generated. Never edit it.

## Template shape

Every template follows this order:

1. `{%- include 'shared/config' -%}`
2. Template-specific settings and captures
3. Logic: compute everything the markup needs, including `email_title` and `preheader`
4. `{%- include 'shared/document-start' -%}`
5. Body rows (`<tr>` elements inside the container table)
6. `{%- include 'shared/document-end' -%}`

`shopify/order-confirmation.liquid` is the reference implementation. Match its patterns.

## Design rules

- Use tokens from `shared/config.liquid` for every color, size, font, and spacing value. The only hardcoded values allowed are `0` and `1px` hairlines.
- Text styles come from the `st_*` captures, with color appended per use: `style="{{ st_body }} color:{{ c_black }};"`.
- Serif (Times New Roman) is used only at `size_serif` for headlines. Sans (Arial) is used at `size_body` and `size_small`, regular or bold.
- Palette: `c_black`, `c_white`, `c_gray`, `c_brand`. `c_divider` is for hairlines only.
- Layout is tables only. No flexbox, grid, or SVG. Every image has a `width` attribute and `alt` text (empty `alt=""` for decorative icons).
- Buttons are bulletproof: a table cell with `bgcolor` plus an inline-block link.
- Any full-bleed dark block uses `background-image:linear-gradient(...)` alongside `background-color` so forced dark mode doesn't flip it.

## Copy rules

- Never use em dashes.
- Keep reading level low and sentences short.
- No health or performance claims in transactional emails. They confirm orders, they don't sell the product.

## Shopify rules

- Shopify notifications can't include snippets. That's why `{% include %}` exists only in source and `npm run build` inlines it.
- Money values are integers in cents. Always format with `money` or `money_with_currency`.
- Link to the storefront with `store_url`, never `shop.url`. In a headless store `shop.url` can resolve to the myshopify or checkout domain.
- Guard every optional variable with `if`. Undefined variables render blank rather than erroring, so a missing guard fails silently.
- Line items render from `subtotal_line_items`.

## Logic coverage

- Every branch in a template needs a fixture that exercises it. When adding a branch, add a fixture.
- New fixtures start from a base with `"$extends": "order-paid"` and override only what changes. Objects merge deeply; arrays and primitives replace; `null` removes a field.
- Every fixture has a `"$description"` explaining the scenario. It shows as a tooltip and caption in the preview.
- LiquidJS is close to Shopify's renderer but not identical. Local preview is the design loop; Shopify's notification preview and a real test order are the final check.

## Ownership

Each customer moment has exactly one sender. The full map lives in Notion: Porrada Infra > Notification Templates.

- **Shopify:** orders, shipping, accounts, returns
- **Recharge:** subscription lifecycle, billing, portal access
- **Klaviyo:** subscription pause, resume, skip, and abandoned checkout
- **Off:** the entire Shopify Subscriptions section, which duplicates Recharge

## Definition of done for a template

1. Renders correctly for every fixture on mobile and desktop
2. `npm run build` passes
3. Image placeholders in `shared/config.liquid` swapped for Klaviyo CDN URLs before pasting
4. Pasted from `dist/` and checked in Shopify's preview
5. Real test order received and checked, including Gmail on iPhone in dark mode
