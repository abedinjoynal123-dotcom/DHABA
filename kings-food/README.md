# King's Food — Website & online ordering

[![Netlify Status](https://api.netlify.com/api/v1/badges/4482531f-61da-4df5-ab88-4f14d799ab04/deploy-status)](https://app.netlify.com/projects/kings-food-tallinn/deploys)

Live site: https://kings-food-tallinn.netlify.app · Staff screen: https://kings-food-tallinn.netlify.app/staff/

Premium Fast Food · Pärnu mnt 326, Nõmme, Tallinn · +372 5559 2222 · Est. 2026

- **Website** (`public/`): bilingual (Estonian/English) royal red & gold site with the ivory menu card.
- **Order form** (`/api/checkout`): customers tap **+ Lisa** on menu items, choose size and fries/rice, review the cart, enter name and phone, and send.
- **POS** (`/staff/`): the full King's Food till, in Estonian, English and Russian:
  - **Till** for kiosk, Wolt and Bolt orders (app prices +40 %), card/cash, discounts and staff meals.
  - **Kitchen** board (New → Cooking → Ready), customer **pickup screen**, sound for new orders.
  - **Website orders** from the order form appear in the kitchen automatically, marked *Website · Pay at pickup*; staff record card or cash when handing them over.
  - **Sales** with VAT, hourly chart, top items, by staff, Z-report; **Records** with CSV export; **Menu** editor.
  - **Inventory**: stock levels, deliveries, waste, stock counts, recipes that deduct stock on every sale, food cost, supplier **invoices** (add, edit, delete).
  - **Staff portal**: each person has a 4-digit PIN; managers see everything, staff see Till, Kitchen and Pickup. Shift log.
  - **AI** (needs `ANTHROPIC_API_KEY`): **AI Manager** chat with voice, invoice photo reading, and an inventory assistant that records deliveries, counts, waste and recipes on request (every change has Undo).

## How it fits together

```
public/                     static website (Netlify publish directory)
  assets/data/menu.json     the menu: single source of truth for site and orders
  assets/data/site.json     phone, address, hours, ordering on/off, payment note
  assets/js/main.js         renders the site and menu
  assets/js/order.js        order form: add to order, cart, checkout
  staff/index.html          the POS app (built from pos/src, do not edit by hand)
netlify/functions/checkout.mts POST /api/checkout, orders from the order form
netlify/functions/orders.mts GET/PATCH /api/orders, website orders API (live test)
netlify/functions/pos.mts   /api/pos/*, the POS backend: pairing, PIN sign-in, data, photos
netlify/functions/pos-ai.mts /api/pos-ai, background function that calls Claude for the POS
netlify/lib/                menu pricing, order storage, POS data and sign-in
pos/src/                    POS app source (shell.html, i18n.js, app.js, inv.js, ai.js, ia.js, runtime.js)
pos/build.mjs               builds public/staff/index.html
```

### How the POS is secured

- **Device pairing.** Each tablet or phone is connected once with the owner code (`STAFF_PIN`). Until then the POS API answers nothing. Ten wrong codes lock pairing for 15 minutes. **Changing `STAFF_PIN` disconnects every device** (use this if a device is lost).
- **Personal PINs.** People sign in with their own 4-digit PIN, checked on the server; five wrong tries lock that person for 5 minutes. PIN hashes never leave the server.
- **Roles on the server.** Staff can take orders, move them through the kitchen, start/end shifts and mark dishes sold out. Everything else (menu prices, stock, invoices, staff, sales reports, AI) is managers only. A person who is deactivated or demoted loses access at their next action.
- The till locks itself after 10 minutes without use (kitchen and pickup screens stay open). Locking closes the AI screens.

### How the POS stores data

- Netlify Blobs, store `pos`, region `eu-central-1`: one blob per collection (menu, staff, shifts, stock, stock moves, invoices, reports) and one per day of till orders. Every write is a compare-and-swap, so tills saving at the same moment never overwrite each other. Invoice photos are stored in the same store.
- Website orders stay in the `orders` store; the POS shows them and writes status changes back to them.
- Open screens check for changes every 6 seconds on Till, Kitchen and Pickup, every 15 seconds on other screens and every minute when the tab is hidden; only changed data is sent. Each check is one short function call, so a kitchen tablet open for a 10-hour day makes about 6,000 calls. On Netlify's credit-based plans this uses function compute and request credits: watch **Usage** in Netlify for the first week, especially on the Free plan (300 credits/month, hard limit).
- On first use the till menu is filled from `menu.json` (every size becomes its own button). After that, edit the till menu in the POS (**Menu** tab); `menu.json` still drives the website and the order form.

- The server validates every item, size, side and quantity and prices orders from `menu.json`; totals sent by the browser are ignored.
- Orders are stored in Netlify Blobs in the EU (`eu-central-1`), one record per order under its Tallinn date. Order numbers are 3 digits, unique per day.

## Setup on Netlify (one time)

1. **Link the repo.** In the Netlify project go to Project configuration → Build & deploy → Link repository → `abedinjoynal123-dotcom/DHABA`. Branch `main`, **Base directory `kings-food`**. Leave the build command and publish directory empty; `netlify.toml` sets them.
2. **Add environment variables** (Project configuration → Environment variables, scope must include **Functions**):
   - `STAFF_PIN` (required): the owner code used to connect each POS device (use at least 6 digits; also used by the live test).
   - `ANTHROPIC_API_KEY` (optional, mark as secret): turns on the POS AI features. Each AI question or invoice photo is billed to this key. Without it the POS works fully, with the AI tab showing "not available" and invoices typed by hand.
   - `AI_MODEL` (optional): defaults to `claude-sonnet-5-5`.
   - `POS_SECRET` (optional): a long random string for signing POS sign-ins. If unset it is derived from `STAFF_PIN`.
3. Redeploy (Deploys → Trigger deploy) so the functions pick up the variables.

## Daily use

- **First time:** open `https://<your-site>/staff/` on the tablet, enter the owner code (`STAFF_PIN`), then create the first manager with a name and 4-digit PIN. Add the rest of the team under **Staff**.
- **Every day:** staff tap their name and PIN. The kitchen tablet can stay on the **Kitchen** screen; a second screen facing customers can show **Pickup** (Lock → *Customer screen*, no PIN needed).
- **Website orders** pop up in the kitchen with a sound (turn **Sound** on). When the customer collects and pays, tap **Paid · card** or **Paid · cash** so the Z-report adds up.
- **Voice:** the microphone works in Chrome, Edge and Safari; spoken answers use the device's own voices.

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

# POS
npm run build:pos   # after editing pos/src (npm test fails if you forget)
STAFF_PIN=123456 ANTHROPIC_API_KEY=test npm run dev:pos -- 8899   # local POS with in-memory data and a fake Claude
npm run test:pos-e2e -- http://localhost:8899                     # browser test (needs Playwright)
```
