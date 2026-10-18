# King's Food — Website & AI ordering

Premium Fast Food · Pärnu mnt 326, Nõmme, Tallinn · +372 5559 2222 · Est. 2026

- **Website** (`public/`): bilingual (Estonian/English) royal red & gold site with the ivory menu card.
- **Order form** (`/api/checkout`): customers tap **+ Lisa** on menu items, choose size and fries/rice, review the cart, enter name and phone, and send. No AI involved and no API key needed.
- **AI assistant chat** (`/api/chat`, text only): answers questions and can also take orders by chat. It prices every order from the menu file, confirms it with the customer and sends it to the kitchen.
- **Staff orders screen** (`/staff/`): PIN-protected list of incoming orders with status buttons and the day's sales. This is the start of the POS.

## How it fits together

```
public/                     static website (Netlify publish directory)
  assets/data/menu.json     the menu: single source of truth for site, AI and orders
  assets/data/site.json     phone, address, hours, ordering on/off, payment note
  assets/js/main.js         renders the site and menu
  assets/js/order.js        order form: add to order, cart, checkout
  assets/js/chat.js         AI assistant chat widget
  staff/index.html          staff orders screen
netlify/functions/checkout.mts POST /api/checkout, orders from the order form
netlify/functions/chat.mts  POST /api/chat, the ordering assistant (Claude)
netlify/functions/orders.mts GET/PATCH /api/orders, staff API
netlify/lib/                menu pricing, order storage, assistant prompt and tools
```

- The assistant runs on Claude (`claude-opus-5-5`) with two tools: `price_order` (exact itemized total from `menu.json`) and `place_order` (saves the order). The server validates every item, size, side and quantity and computes the price itself, so the AI cannot charge a wrong amount or invent an item.
- Both the order form and the chat price orders on the server from `menu.json`; totals sent by the browser are ignored.
- Orders are stored in Netlify Blobs in the EU (`eu-central-1`), one record per order under its Tallinn date. Order numbers are 3 digits, unique per day.

## Setup on Netlify (one time)

1. **Link the repo.** In the Netlify project go to Project configuration → Build & deploy → Link repository → `abedinjoynal123-dotcom/DHABA`. Branch `main`, **Base directory `kings-food`**. Leave the build command and publish directory empty; `netlify.toml` sets them.
2. **Add environment variables** (Project configuration → Environment variables, scope must include **Functions**):
   - `ANTHROPIC_API_KEY`: your key from https://console.anthropic.com (mark as secret).
   - `STAFF_PIN`: the PIN staff type on `/staff/` (use at least 6 digits).
3. Redeploy (Deploys → Trigger deploy) so the functions pick up the variables.

The order form works without `ANTHROPIC_API_KEY`. Until the key is set, the chat tells customers to order from the menu or call.

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
| Chat text (ET/EN) | `STRINGS` in `public/assets/js/chat.js` |
| Assistant behaviour | `netlify/lib/assistant.mts` |

- `"available": false` on a menu item hides it from the site and the assistant (sold out).
- Opening hours, e.g. `"hours": { "mon": ["11:00", "21:00"], "sun": "closed" }`. Once set, the order form and the assistant refuse orders outside them, and the site shows them.
- `"ordering": { "enabled": false }` stops all online orders (form and chat) after redeploy.

## Development

```bash
cd kings-food
npm install
npm test            # pricing, opening hours, order form API and the chat flow (Claude simulated)
npm run typecheck
npx netlify dev     # run site + functions locally (needs ANTHROPIC_API_KEY and STAFF_PIN in .env)
```
