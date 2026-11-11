# Recharge templates

Recharge customer notifications use **Jinja2**, not Shopify Liquid. Edit the native `.jinja` source here and paste the generated `.html` from `dist/recharge/` into the matching Recharge notification editor. The modern Upcoming order email uses its own Flows notification node; the other templates use their corresponding customer notification settings.

| Notification | Source | Paste-ready output |
| --- | --- | --- |
| Subscription activation | `subscription-activation.jinja` | `dist/recharge/subscription-activation.html` |
| Subscription cancellation | `subscription-cancellation.jinja` | `dist/recharge/subscription-cancellation.html` |
| Subscription recurring charge confirmation | `subscription-recurring-charge-confirmation.jinja` | `dist/recharge/subscription-recurring-charge-confirmation.html` |
| Upcoming order email | `upcoming-order-email.jinja` | `dist/recharge/upcoming-order-email.html` |
| Out of stock | `out-of-stock.jinja` | `dist/recharge/out-of-stock.html` |
| Card declined | `card-declined.jinja` | `dist/recharge/card-declined.html` |
| Card declined (hard declines) | `card-declined-hard.jinja` | `dist/recharge/card-declined-hard.html` |
| Get account access by code | `get-account-access-by-code.jinja` | `dist/recharge/get-account-access-by-code.html` |
| Get account access | `get-account-access.jinja` | `dist/recharge/get-account-access.html` |
| Customer token account link | `customer-token-account-link.jinja` | `dist/recharge/customer-token-account-link.html` |

## Local setup

Run `npm run setup:recharge` once to install the pinned Python preview dependencies into the project-local `.venv`. Then use the same `npm run dev` and `npm run build` workflow as the Shopify templates. Python 3 is required for local Recharge rendering; the generated HTML has no local runtime dependency when pasted into Recharge.

The preview and build render the generated output with real Jinja2 and `StrictUndefined`, so unguarded missing variables fail locally. Recharge's `amount_with_currency` filter is modeled locally for previews. Its final formatting and notification data still need checking in Recharge.

Run `npm run test:recharge` for regressions covering omitted component inputs, empty and sparse notification data, and amount, color, and account-link behavior. Run `npm run build` to regenerate paste-ready output and render every fixture with strict variable checks.

## Shared design

The templates include the existing shared config, document wrapper, support footer, and basic components. The build converts those shared Liquid sources into standard Jinja syntax and inlines every include. It rejects unsupported shared syntax rather than silently emitting incompatible code. Edit shared design tokens once to update both platforms.

Shared config explicitly initializes `tone` to `light` before any components render; it does not depend on a Recharge variable. The document requests a light-only color scheme and explicitly sets white content backgrounds and dark text. The black support footer selects its own contrasting colors. Email clients can still apply their own color overrides, so check received emails in dark mode before publishing.

Recharge-specific item, summary, and merchant-information components live in `shared/components/` as `.jinja` files. Do not paste Shopify's generated `.liquid` files into Recharge.

## Data contracts

- **Activation:** `line_items` contains the activated purchase's items. Billing cadence uses `charge_interval_frequency` and `order_interval_unit`; `next_charge_date` is a billing date, not a delivery estimate. Optional quantity, variant, expiration, discount, and total details come from Recharge's payload. The template does not calculate a new order total.
- **Amounts:** Recharge uses decimal currency units, unlike Shopify's integer cents. Activation uses `amount_with_currency(charge_currency, display_currency_code=True/False)`, matching the supplied native example. The modern Upcoming order email uses the documented Flows filter with its supplied `charge.currency`. The classic recurring charge confirmation displays the supplied decimal total plus currency directly because the filter is not documented for that notification. Never multiply supplied item totals by quantity or invent a zero or USD price when amount or currency is missing.
- **Customer cancellation:** this notification is sent when all the customer's subscriptions become inactive. Recharge does not expose subscription item details to this template. It is separate from the store-owner per-item Cancellation alert. Existing orders, one-time purchases, refunds, and remaining prepaid shipments are separate from future subscription renewals.
- **Recurring charge confirmation:** this confirms a processed payment, not shipment. Optional `line_item_modifications` identify quantity changes or removals using Recharge's documented one-based `line_item_id` mapping. Included quantities reflect supplied changes; uncertain mappings suppress the included-item list. Removed quantities have no invented item prices. The supplied charge total remains authoritative.
- **Upcoming order email:** this is the modern nested `customer` / `charge` payload, not the legacy flat Upcoming charge notification. `charge.scheduled_at` is a billing date. `charge.subtotal_price` is already after product discounts; show supplied discounts as information without subtracting them again. Omit undocumented shipping-line child fields and internal notes. Display the supplied final total without recalculation.
- **Out of stock:** fulfillment settings can hold an entire order or allow partial fulfillment. The notice does not assume either mode, a restock date, a canceled subscription, or a payment outcome. The `out_of_stock_items` structure is not documented, so no invented item-field contract is used.
- **Payment declines:** soft declines may be retried according to the store's settings; no fixed date or attempt count is promised. Hard declines require updated payment details before retry. These notices do not establish subscription cancellation. Check the hard-decline message in the relevant failed-payment recovery notification settings.
- **Account links:** all account, subscription-management, billing, and access buttons use Porrada's configured `account_url`, `https://porradanutra.com/account`, per the storefront routing requirement. Ignore Recharge portal, billing, token, and login URLs in notification payloads. Account navigation must not be described as automatically authenticating or restarting a subscription. Preserve supplied access codes as text for the sign-in screen where they were requested.
- **Account access:** `access_code` is escaped and displayed intact, including leading zeroes, only in the email body. Missing codes direct customers to request a new code. Generic access messages do not assume an undocumented account-status flag. The Customer token account link template opens the ordinary Porrada account page and requires sign-in; it deliberately does not consume Recharge's magic token because every account action must use `/account`.
- **Terms and merchant details:** preserve `shop_legal_text` when available. Recharge's activation terms setting supports HTML, so render it in a content block rather than escaping it or putting block markup inside a paragraph. Never replace missing terms with invented policy text. The store link remains Porrada's configured `store_url`.

The customer-supplied Subscription confirmation example is the reference for activation fields and native filter syntax. Additional references:

- [Recharge notification variables](https://support.getrecharge.com/hc/en-us/articles/360008830713-Using-variables-in-notification-templates-and-scripts)
- [Managing email notifications and settings](https://support.getrecharge.com/hc/en-us/articles/360006356293-Managing-email-notifications-and-settings)
- [Updating legal settings](https://support.getrecharge.com/hc/en-us/articles/360034107094-Updating-the-legal-settings)
- [Pausing and canceling subscriptions](https://support.getrecharge.com/hc/en-us/articles/360008828973-Pause-cancel-or-delete-a-subscription)
- [Customizing the Upcoming order email](https://support.getrecharge.com/hc/en-us/articles/32332326071959-How-to-customize-the-Upcoming-order-email)
- [Available variables for Flows](https://support.getrecharge.com/hc/en-us/articles/34951025082519-Available-variables-for-Flows)
- [Notification node in Flows](https://support.getrecharge.com/hc/en-us/articles/22263608220951-Using-the-Notification-node-in-flows)
- [Partial order fulfillment for out-of-stock items](https://support.getrecharge.com/hc/en-us/articles/10093532488343-Configuring-partial-order-fulfillment-for-out-of-stock-items)
- [Passwordless login for the customer portal](https://support.getrecharge.com/hc/en-us/articles/8537122240023-Passwordless-login-for-the-customer-portal)

## Before publishing

Check the generated HTML in the matching Recharge **Preview**, then trigger each real notification event and inspect the received email, including Gmail on iPhone in dark mode. Use the Upcoming order flow's notification-node preview and test path for that template. The classic Send a test email feature can omit template rendering and variables, so it is not the final content check. Check account links while signed out of the ecommerce admin. Nothing in the local build changes Recharge settings or sends customer emails.
