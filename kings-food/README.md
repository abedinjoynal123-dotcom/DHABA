# King's Food — Website & online ordering

[![Netlify Status](https://api.netlify.com/api/v1/badges/4482531f-61da-4df5-ab88-4f14d799ab04/deploy-status)](https://app.netlify.com/projects/kings-food-tallinn/deploys)

Live site: https://kings-food-tallinn.netlify.app · Staff screen: https://kings-food-tallinn.netlify.app/staff/

Premium Fast Food · Pärnu mnt 326, Nõmme, Tallinn · +372 5559 2222 · Est. 2026

- **Website** (`public/`): bilingual (Estonian/English) royal red & gold site with the ivory menu card.
- **Order form** (`/api/checkout`): customers tap **+ Lisa** on menu items, choose size and fries/rice, review the cart, enter name and phone, and send.
- **Staff orders screen** (`/staff/`): PIN-protected list of incoming orders with status buttons and the day's sales. This is the start of the POS.

## How it fits together

```
public/                     static website (Netlify publish directory)
  assets/data/menu.json     the menu: single source of truth for site and orders
  assets/data/site.json     phone, address, hours, ordering on/off, payment note
  assets/js/main.js         renders the site and menu
  assets/js/order.js        order form: add to order, cart, checkout
  staff/index.html          staff orders screen
netlify/functions/checkout.mts POST /api/checkout, orders from the order form
netlify/functions/orders.mts GET/PATCH /api/orders, staff API
netlify/lib/                menu pricing and order storage
```

- The server validates every item, size, side and quantity and prices orders from `menu.json`; totals sent by the browser are ignored.
- Orders are stored in Netlify Blobs in the EU (`eu-central-1`), one record per order under its Tallinn date. Order numbers are 3 digits, unique per day.

## Setup on Netlify (one time)

1. **Link the repo.** In the Netlify project go to Project configuration → Build & deploy → Link repository → `abedinjoynal123-dotcom/DHABA`. Branch `main`, **Base directory `kings-food`**. Leave the build command and publish directory empty; `netlify.toml` sets them.
2. **Add the environment variable** `STAFF_PIN` (Project configuration → Environment variables, scope must include **Functions**): the PIN staff type on `/staff/` (use at least 6 digits).
3. Redeploy (Deploys → Trigger deploy) so the functions pick up the variable.

## Daily use

- Staff open `https://<your-site>/staff/` on a tablet or phone, enter the PIN and keep it open. New orders appear within 10 seconds; turn **Sound** on for a chime.
- Status flow: New → Preparing → Ready → Handed over, or Cancelled. Sales totals exclude cancelled orders.

## Editing content

| What | File |
| --- | --- |
| Menu items, prices (in cents: `790` = 7,90 €), sizes | `public/assets/data/menu.json` |
| Phone, email, opening hours, socials, Wolt/Bolt, ordering on/off, payment note | `public/assets/data/site.json` |
| Website text (ET/EN) | `STRINGS` in `public/assets/js/main.js` |
| Order form text (ET/EN) | `STRINGS` in `public/assets/js/order.js` |

- `"available": false` on a menu item hides it from the site and the order form (sold out).
- Opening hours, e.g. `"hours": { "mon": ["11:00", "21:00"], "sun": "closed" }`. Once set, the order form refuses orders outside them, and the site shows them.
- `"ordering": { "enabled": false }` stops online orders after redeploy.

## Development

```bash
cd kings-food
npm install
npm test            # pricing, opening hours and the order form API
npm run typecheck
npx netlify dev     # run site + functions locally (needs STAFF_PIN in .env)
```
