# King's Food — Website

Premium Fast Food · Pärnu mnt 326, Nõmme, Tallinn · Est. 2026

A static, dependency-free website (HTML/CSS/JS) with a royal red & gold theme and an ivory menu card. Bilingual: Estonian (default) and English.

## Run locally

```bash
cd kings-food
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

No build step. Upload the `kings-food/` folder as-is to any static host (Netlify, GitHub Pages, Cloudflare Pages, Vercel).

## Editing content

| What | File |
| --- | --- |
| Menu items, prices, variants | `assets/js/menu-data.js` |
| Phone, email, opening hours, social links, Wolt/Bolt links | `assets/js/site-config.js` |
| Page text (ET/EN) | `STRINGS` in `assets/js/main.js` |
| Colours and layout | `assets/css/styles.css` |

Empty fields in `site-config.js` are hidden on the page, so no placeholder is ever published.

Prices are stored in **euro cents** (`790` = 7,90 €).

## Ready for the POS

`menu-data.js` is the single source of truth for the menu and is structured for the upcoming phone POS:

- stable `id` on every category, item and variant (use these in order lines and sales records)
- the price sits on the variant (e.g. Kebab Box small/large, Burger/Kebab burger)
- `options` for free choices that don't change the price (fries or rice)
- `available: false` on an item hides it from the menu (sold-out toggle)
