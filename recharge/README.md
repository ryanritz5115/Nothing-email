# Recharge templates

Recharge notification emails are edited in the Recharge merchant portal (Email > Customer), one template at a time.

Before building the first one here, confirm two things in Recharge's docs or editor:

1. **Template syntax.** Recharge's templating isn't Shopify Liquid, and its filters differ. The preview server renders with LiquidJS, which handles the shared `{{ }}` and `{% if %}` basics, but Recharge-specific filters will need shims in `scripts/lib.ts`, the same way Shopify's `money` and `format_address` are shimmed.
2. **Variable names.** Recharge exposes its own objects (customer, subscription, charge, address). Fixtures for Recharge templates go in `fixtures/recharge/` and follow Recharge's object shapes, not Shopify's order.

The shared config, document start, and footer are reusable as long as the syntax is compatible.
