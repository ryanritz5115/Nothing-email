# porrada-email

Source of truth for Porrada's Shopify and Recharge notification templates.

## Setup

```bash
npm install
npm run setup:recharge # Python/Jinja2 preview dependencies, once
npm run dev     # http://localhost:3000
```

## Workflow

1. Edit a template in `shopify/` or `recharge/`, or the shared files in `shared/`.
2. Preview it at http://localhost:3000. Switch fixtures with the pills to check every scenario. Edits reload live.
3. Run `npm run build`. It writes paste-ready files to `dist/` and fails if any fixture doesn't render.
4. Paste `dist/shopify/<template>.liquid` into Shopify or `dist/recharge/<template>.html` into Recharge. The preview's "Paste-ready source" link shows the same output without building.

## Adding a template

Copy the shape of `shopify/order-confirmation.liquid`: include config, compute logic, include document start, write body rows from `shared/components/`, include document end. Add a `fixtures/<platform>/<template>/` folder with a base fixture and one fixture per branch.

## Adding a scenario

Create `fixtures/shopify/<template>/<name>.json` with `"$extends"` pointing at that folder's base fixture, a `"$description"`, and only the fields that change.

See `CLAUDE.md` for the full conventions.

## Shopify templates

| Notification | Source / paste-ready filename |
| --- | --- |
| Order confirmation | `order-confirmation.liquid` |
| New gift card | `new-gift-card.liquid` |
| Gift card receipt | `gift-card-receipt.liquid` |
| Store credit issued | `store-credit-issued.liquid` |
| Shipping confirmation | `shipping-confirmation.liquid` |
| Shipping update | `shipping-update.liquid` |
| Out for delivery | `out-for-delivery.liquid` |
| Delivered | `delivered.liquid` |
| Order canceled | `order-canceled.liquid` |
| Order refund | `order-refund.liquid` |
| Order edited | `order-edited.liquid` |
| Contact customer | `contact-customer.liquid` |
| Request received | `request-received.liquid` |
| Return request approved | `return-request-approved.liquid` |
| Return request declined | `return-request-declined.liquid` |
| Return created | `return-created.liquid` |

Edit sources in `shopify/`; paste the corresponding generated file from `dist/shopify/`. All templates appear in the local preview automatically.

`New gift card` preserves the supplied centered gift artwork, value, gift-code actions, and redemption steps, wrapped in the shared header, support section, and brand footer. Gift redemption and sharing use the configured storefront cart and link-copy routes. Missing codes direct customers to support; missing values stay unknown. Optional messages, expiry dates, and Apple Wallet passes appear only when supplied.

`Gift card receipt` is the purchaser's copy. It confirms the recipient and, when supplied, the scheduled send date, then shows the gift artwork, value, personal message, code, and optional expiry. Its order button uses configured `orders_url`; it has no recipient redemption or wallet actions. Shopify's [gift card overview](https://help.shopify.com/en/manual/products/gift-card-products/overview) distinguishes this purchaser receipt from the recipient's New gift card notification.

`Store credit issued` uses the same centered style with configured `img_store_credit`, a single account button, and one checkout instruction. Its amount and optional expiry come from `issued_store_credit`; the issued amount is separate from the resulting account balance.

Order navigation always uses `orders_url` from `shared/config.liquid` (`https://porradanutra.com/account/orders`). Shopify-supplied order links are ignored. General Contact customer messages without order context use support; tracking, return-label, and payment links keep their event-specific destinations.

Shipment updates cover only the notified fulfillment. Delivery notices omit stale delivery estimates. Cancellation and edit notices distinguish the order balance from successful, processing, or unsuccessful refunds. Refund notices use the current refund's `amount` and `refund_line_items`; order-wide transaction history is labeled separately.

`Request received` is Shopify's `change_requested` notification: it can acknowledge a return request, a cancellation request, or both. It does not confirm approval or a completed cancellation. Return emails show only the relevant request lines; approval and creation include available labels, return tracking, exchange items, fees, and order balance. Estimated refunds are separate from issued refunds. Declined requests show the customer-facing `return.decline['note']` when present and never the internal reason.

`Contact customer` preserves Shopify's `custom_message`, including rich message content. Return order context and delivery setup follow the [reviewed Shopify template source](https://github.com/maizzle/shopify-notification-templates/tree/7cde89bd00dd61a57902237b535e45b276822f92/customer-notifications/returns-and-cancellations). Shopify's [return approval](https://help.shopify.com/en/manual/fulfillment/setup/notifications/exchange-notifications/return-approved) and [return creation](https://help.shopify.com/en/manual/fulfillment/setup/notifications/exchange-notifications/return-created) guides document the exchange, payment, and financial fields. Verify these notification-specific fields in Shopify's preview before deploying.

Variable reference: [Shopify notification variables](https://help.shopify.com/en/manual/fulfillment/setup/notifications/email-variables). Local rendering uses LiquidJS and USD money shims. Before going live, check Shopify's notification preview and send real test emails, including Gmail on iPhone in dark mode. Fixture product images are preview placeholders; live notifications use the order's product images.

## Recharge templates

| Notification | Source | Paste-ready output |
| --- | --- | --- |
| Subscription activation | `recharge/subscription-activation.jinja` | `dist/recharge/subscription-activation.html` |
| Subscription cancellation | `recharge/subscription-cancellation.jinja` | `dist/recharge/subscription-cancellation.html` |
| Subscription recurring charge confirmation | `recharge/subscription-recurring-charge-confirmation.jinja` | `dist/recharge/subscription-recurring-charge-confirmation.html` |
| Upcoming order email | `recharge/upcoming-order-email.jinja` | `dist/recharge/upcoming-order-email.html` |
| Out of stock | `recharge/out-of-stock.jinja` | `dist/recharge/out-of-stock.html` |
| Card declined | `recharge/card-declined.jinja` | `dist/recharge/card-declined.html` |
| Card declined (hard declines) | `recharge/card-declined-hard.jinja` | `dist/recharge/card-declined-hard.html` |
| Get account access by code | `recharge/get-account-access-by-code.jinja` | `dist/recharge/get-account-access-by-code.html` |
| Get account access | `recharge/get-account-access.jinja` | `dist/recharge/get-account-access.html` |
| Customer token account link | `recharge/customer-token-account-link.jinja` | `dist/recharge/customer-token-account-link.html` |

Recharge uses native Jinja2 and decimal currency amounts. The build converts shared design components to Jinja and validates every Recharge fixture with a real Jinja2 renderer. All account-related links use `https://porradanutra.com/account`. See [Recharge setup and contracts](recharge/README.md) for notification-specific variables, account-access behavior, and final checks in Recharge's Preview.
