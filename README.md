# porrada-email

Source of truth for Porrada's Shopify and Recharge notification templates.

## Setup

```bash
npm install
npm run dev     # http://localhost:3000
```

## Workflow

1. Edit a template in `shopify/` or `recharge/`, or the shared files in `shared/`.
2. Preview it at http://localhost:3000. Switch fixtures with the pills to check every scenario. Edits reload live.
3. Run `npm run build`. It writes paste-ready files to `dist/` and fails if any fixture doesn't render.
4. Paste `dist/<platform>/<template>.liquid` into the notification editor. The preview's "Paste-ready source" link shows the same output without building.

## Adding a template

Copy the shape of `shopify/order-confirmation.liquid`: include config, compute logic, include document start, write body rows, include document end. Add fixtures for any new branches.

## Adding a scenario

Create `fixtures/shopify/<name>.json` with `"$extends": "order-paid"`, a `"$description"`, and only the fields that change.

See `CLAUDE.md` for the full conventions.
