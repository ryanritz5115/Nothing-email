# Porrada email templates

Source of truth for Porrada's transactional email templates. Shopify and Recharge notification editors receive built output from `dist/`; nothing is edited directly in those editors.

## Principles

These apply to every template. When a choice isn't covered by a rule below, decide by these.

1. **Answer every question so the customer feels safe.** People feel buyer's remorse after a purchase. Each email should leave them confident and glad they bought, with nothing left to wonder about. Give thorough updates: what happened, what happens next, when, and what to do if something is wrong. A customer who has to guess will worry, so they shouldn't have to.
2. **Extremely clean design.** Clean design reads as trustworthy. Every element earns its place, with generous spacing and a clear hierarchy.
3. **Shared components everywhere.** Build from `shared/components/` (text stack, actions, line item, detail, card, and so on) so every email looks and behaves the same. If a template needs something a component could do, add or extend the component instead of writing one-off markup.

## Commands

- `npm run dev` starts the preview at http://localhost:3000 with live reload, fixture switching, and mobile and desktop frames.
- `npm run build` writes paste-ready files to `dist/` and renders every template against every fixture in its folder. A failing render fails the build.
- `npm run test:recharge` checks strict undefined handling, optional component inputs, empty payloads, colors, account links, and amount fallbacks.

## Structure

- `shared/config.liquid` holds every token: colors, type, spacing, sizes, image URLs, links, and the `st_*` style captures.
- `shared/document-start.liquid` and `shared/document-end.liquid` wrap every email: head, preheader, container, logo, support footer.
- `shared/components/` holds the building blocks every template is made from. See Components below.
- `shopify/` holds `.liquid` sources; `recharge/` holds native `.jinja` sources, one per notification.
- `fixtures/<platform>/<template>/` holds mock data for one template, one file per scenario.
- `scripts/` holds the preview server, the build, and the Shopify filter shims.
- `dist/` is generated. Never edit it.

## Template shape

Every template follows this order:

1. `{%- include 'shared/config' -%}`, then `{%- include 'shared/shipment' -%}` in any template about one shipment
2. Template-specific settings and captures
3. Logic: compute everything the markup needs, including `email_title` and `preheader`
4. `{%- include 'shared/document-start' -%}`
5. Body rows (`<tr>` elements inside the container table), built from components
6. `{%- include 'shared/document-end' -%}`

`shopify/order-confirmation.liquid` is the reference implementation. Match its patterns. Every order email opens the same way: a hero row with a text stack (eyebrow `Order {{ order_name }}`), then an optional card, then actions.

`shopify/new-gift-card.liquid` is the gift-card notification. It uses the shared document, support section, and brand footer around the customer's supplied gift-card design, preserving its centered styling from the gift headline through the Checkout instructions. Keep gift-specific styles and artwork in config and its body in `shared/components/gift-card-content.liquid`. Preserve the configured custom gift-cart and sharing routes rather than substituting `orders_url`. Escape sender, recipient, and message text; URL-encode the gift code before adding it to the cart query. Missing codes use support and omit code-based redemption instructions; missing amounts remain unknown and a supplied zero remains visible. Keep supplied expiry dates and Apple Wallet passes optional.

`shopify/gift-card-receipt.liquid` is the purchaser's copy of a recipient gift, following Shopify's [gift card notification contract](https://help.shopify.com/en/manual/products/gift-card-products/overview). Use supplied `gift_card.send_on` for scheduled wording; otherwise confirm sending only when recipient identity is available, with neutral wording when context is missing. A schedule is not proof of delivery or redemption. Show supplied code, amount, message, and expiry with escaping and optional guards; missing values remain unknown and zero remains visible. Reuse the gift design and shared wrapper, with an order action to `orders_url`, rather than recipient cart, sharing, redemption-step, or wallet actions.

`shopify/store-credit-issued.liquid` follows the same centered design using `img_store_credit` and `account_url`. Show `issued_store_credit.amount` and optional `issued_store_credit.expires_at`; never substitute `balance_after_transaction` for the issued amount. Missing amounts stay unknown and supplied zero remains visible. Use one checkout instruction to select store credit as a payment method while signed in. There are no gift codes, cart/share links, or wallet actions.

## Components

`npm run build` inlines every `{% include %}`, so a component is a block of markup that reads variables. Set its inputs with `assign` right before the include. Each component resets its inputs after rendering, so every use starts clean. The comment at the top of each file lists its inputs.

```liquid
{%- assign button_label = 'View your order' -%}
{%- assign button_url   = orders_url -%}
{%- include 'shared/components/actions' -%}
```

- `text-stack`: eyebrow, headline, body. Opens every email and the support footer.
- `actions`: pill button plus an optional "or <link>" line.
- `card`: hairline box for the facts a customer looks for first, filled with details.
- `section-heading`: the row that opens a body section.
- `line-item`: one product row. Prices are optional, so it serves order, shipping, and refund emails.
- `detail`: small label over its value. Addresses, methods, tracking, and Q&A answers.
- `address`: address lines from fields. Capture it and pass it to a detail.
- `tone`: sets colors for `tone = 'dark'` (on black) or light. Shared config explicitly initializes `tone = 'light'` before any components render; never rely on a platform-supplied value. Text stack and actions read it.

Shipment emails (shipping confirmation, shipping update, and the ones that follow) share these. They read the variables `shared/shipment.liquid` computes from Shopify's `fulfillment`:

- `shipment-card`: estimated delivery and tracking in a card.
- `shipment-actions`: "Track your package" when there's one tracking link, otherwise "View your order".
- `shipment-items`: the "Items in this shipment" section, with "1 of 2" for partial lines.
- `shipping-details`: the address, method, and PO number section.
- `shipment-faq`: the "Good to know" section with the standard shipping answers, plus an optional lead question for that email.

`shipment-faq` reads `shipment_stage` for delivery-stage guidance. Delivered notifications clear `delivery_date` so a past estimate does not look like an upcoming delivery. Shipment actions use `orders_url` when tracking is unavailable, and keep an `orders_url` secondary link when tracking is available.

Order changes use these shared building blocks:

- `shared/payment-adjustment.liquid`: order-wide collected, authorized, successful refund, and other refund-attempt totals. These are lifetime amounts; Shopify's refund-event `amount` is separate.
- `payment-adjustment-card` and `payment-adjustment-faq`: cancellation/refund facts and next steps.
- `order-items`, `refund-items`, and `refund-payments`: canceled order lines, current refund lines, and labeled order-wide payment history. Refunded quantities do not reuse original full-line prices.
- `updated-order-items`: current quantities after edits, omitting removed lines. Missing item data stays unknown.
- `order-totals` and `total-row`: shared totals without subtracting discounts twice.
- `order-edit-card` and `order-edit-faq`: balance due, money still owed back, and next steps. An edit alone does not prove a refund was issued.
- `brand-footer`: the existing wordmark and social links, with assets and mobile sizing in config.

Request and return notifications use `shared/return.liquid` to normalize nested order identity, the configured `orders_url`, return deliveries, labels, and the outstanding order balance. They use these components:

- `return-card`: request status and, only when enabled, available return labels, tracking, and payment details.
- `return-actions`: order/support by default; approved/created templates enable label and payment actions. Every delivery's label stays visible when several packages are involved.
- `return-items`: flat return, exchange, or cancellation-request lines. Never fall back to the entire order's items.
- `return-instructions` and `return-financials`: shipping next steps, exchange summary, fees, and estimated balances for approved/created returns. Return creation and approval do not prove a refund was issued.
- `customer-message`: preserves Shopify's `custom_message` for Contact customer. Its plain-text input safely renders the customer-facing decline note; internal order notes and decline reasons are never substitutes.

Shopify's `Request received` notification covers `requested_edit` (cancellation), `return`, or both. This is distinct from the older return-only request notification. Return notifications can use nested `order.name`; keep identity normalization in `shared/return.liquid`. Their order navigation uses `orders_url` regardless of Shopify-supplied order links.

When a template needs something new, extend a component or add one here. Don't write one-off markup that a component could own.

## Design rules

- Use tokens from `shared/config.liquid` for every color, size, font, and spacing value. The only hardcoded values allowed are `0` and `1px` hairlines.
- Text styles come from the `st_*` captures, with color appended per use: `style="{{ st_body }} color:{{ c_black }};"`. Inside templates, prefer a component over raw styled text.
- Serif (Times New Roman) is used only at `size_serif` for headlines. Sans (Arial) is used at `size_body` and `size_small`, regular or bold.
- Palette: `c_black`, `c_white`, `c_gray`, `c_brand`. `c_divider` is for hairlines only.
- Layout is tables only. No flexbox, grid, or SVG. Every image has a `width` attribute and `alt` text (empty `alt=""` for decorative icons).
- Every layout table gets both `width="100%"` and `style="width:100%;"`. Never rely on shrink-to-fit: Gmail sizes a table without an explicit width to its content. Only buttons and inline icon + text pairs shrink to fit, on purpose.
- In any row with a fixed cell and a flexible cell, give the flexible cell `width="100%"` and `style="width:100%;"`. Otherwise Gmail shrinks it to its content and the cells after it slide left.
- Never use `align="right"` on a nested table to position it. Gmail ignores it. Use a spacer cell plus a content cell with explicit widths, like the totals block.
- Dividers are a border on a full-width `<td>`, never a nested table. A nested divider table collapses to a dot in Gmail.
- Don't output filter-generated HTML (like `format_address`) inside a `<p>`. Build it from fields. Shopify's real output can differ from the local shims, so preview won't catch it.
- Buttons are bulletproof: a table cell with `bgcolor` plus an inline-block link.
- Any full-bleed dark block uses `background-image:linear-gradient(...)` alongside `background-color` so forced dark mode doesn't flip it.

## Copy rules

- Never use em dashes.
- Keep reading level low and sentences short.
- No health or performance claims in transactional emails. They confirm orders, they don't sell the product.
- Support email links and the shared footer always use configured `support_email` (`support@porradanutra.com`), never a platform-supplied shop email. Keep the footer's email lead-in and link together without an explicit line break.

## Shopify rules

- Shopify notifications can't include snippets. That's why `{% include %}` exists only in source and `npm run build` inlines it.
- Money values are integers in cents. Always format with `money` or `money_with_currency`.
- Link to the storefront with `store_url`, never `shop.url`. In a headless store `shop.url` can resolve to the myshopify or checkout domain.
- Every order-navigation action uses `orders_url` from shared config, never Shopify's `order_status_url`, nested `order.order_status_url`, or `customer_order_url`. Contact customer uses the order action only when an order name is available; general messages use support. Shipment tracking, return-label downloads, and payment-collection actions keep their supplied URLs.
- Guard every optional variable with `if`. Undefined variables render blank rather than erroring, so a missing guard fails silently.
- Order summaries render line items from `subtotal_line_items`. Shipment emails render `fulfillment.fulfillment_line_items`, passing each `.line_item` to the line-item component.

## Logic coverage

- Every branch in a template needs a fixture that exercises it. When adding a branch, add a fixture.
- Fixtures live in `fixtures/<platform>/<template>/`. Each template's folder has one base fixture, and the rest extend it with `"$extends": "<sibling>"` and override only what changes. A base can start from another template's fixture with `"$extends": "<template>/<name>"`, e.g. shipping starts from `order-confirmation/order-paid`. Objects merge deeply; arrays and primitives replace; `null` removes a field.
- The preview opens on the base fixture. The build fails if a template has no fixtures.
- Every fixture has a `"$description"` explaining the scenario. It shows as a tooltip and caption in the preview.
- LiquidJS is close to Shopify's renderer but not identical. Local preview is the design loop; Shopify's notification preview and a real test order are the final check.

## Recharge rules

- Recharge notifications use Jinja2. Source files are `.jinja`; paste-ready output is `dist/recharge/<template>.html`. Do not emit Liquid-only `assign`, `capture`, `comment`, or filter syntax in Recharge output.
- Reuse shared Liquid design components through the build's limited shared-to-Jinja conversion. Keep unsupported platform logic out of those components; unsupported conversion must fail the build.
- Run `npm run setup:recharge` for project-local Python rendering dependencies. Recharge fixtures render with actual Jinja2 and `StrictUndefined`; only Recharge-specific filters are modeled for local preview. Guard optional native Jinja values with `is defined` or `default`, including reusable component inputs. In shared Liquid, guard optional boolean inputs with a blank check so the generated Jinja checks for undefined values before using them.
- Recharge's supplied money values are decimal currency units. Activation uses the native `amount_with_currency(charge_currency, display_currency_code=True/False)` filter; modern Upcoming order uses its documented Flows filter with `charge.currency`. Classic recurring charge confirmation displays the supplied decimal amount and currency directly because that notification does not document the filter. Never use Shopify's cents-based money filters or assume USD when currency is missing.
- Every account-related action uses `account_url` (`https://porradanutra.com/account`), including subscription management, payment updates, and account-access emails. Do not use Recharge-supplied portal, billing, login, or token URLs. Access emails must not promise automatic authentication from this ordinary account-page link.
- Activation line items, billing cadence, next charge dates, and terms follow the supplied Recharge example. Billing and shipping schedules are distinct. Display supplied item prices without inventing quantity-based totals or discount expiry.
- Recharge's customer Subscription cancellation is sent when all customer subscriptions are inactive. It has no subscription item list. Do not confuse it with Recharge's store-owner Cancellation alert, which is per item.
- Cancellation does not establish a refund or stop existing orders and remaining prepaid shipments. Account navigation does not itself restart a subscription.
- Preserve optional merchant terms as trusted HTML in a content block, not inside a paragraph. Do not invent terms or expose internal cancellation comments.
- Verify generated output in Recharge's Preview and a real triggered event before publishing. Its Send a test email feature can omit HTML/CSS/variable rendering. See `recharge/README.md` for the full contract and sources.

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
