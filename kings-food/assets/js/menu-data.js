/*
 * King's Food — menu data (single source of truth).
 *
 * The website renders the menu from this file, and the upcoming POS
 * (phone ordering + sales records) will read the same structure, so a
 * price or item changed here changes everywhere.
 *
 * Conventions
 *   - Prices are integers in euro cents (790 = 7,90 €) to avoid float rounding.
 *   - Every item has at least one variant; the variant carries the price.
 *   - `options` are free choices that do not change the price (e.g. fries or rice).
 *   - Text fields are { et, en }.
 */
window.KF_MENU = {
  version: 1,
  currency: "EUR",
  service: { et: "Avatud siin & kaasa", en: "Eat in & takeaway" },

  categories: [
    { id: "mains", name: { et: "Toidud", en: "Mains" } },
    { id: "desserts", name: { et: "Magustoidud", en: "Desserts" } },
    { id: "drinks", name: { et: "Joogid", en: "Drinks" } }
  ],

  options: {
    side: {
      name: { et: "Lisand", en: "Side" },
      choices: [
        { id: "fries", name: { et: "Frii", en: "Fries" } },
        { id: "rice", name: { et: "Riis", en: "Rice" } }
      ]
    }
  },

  items: [
    {
      id: "shaurma",
      category: "mains",
      name: { et: "Shaurma", en: "Shaurma" },
      description: {
        et: "Kana kintsuliha kebab, tortilla, salat, frii",
        en: "Chicken thigh kebab, tortilla, salad, fries"
      },
      variants: [{ id: "regular", price: 790 }]
    },
    {
      id: "kebab-box",
      category: "mains",
      name: { et: "Kebab Box", en: "Kebab Box" },
      description: {
        et: "Kebab, salat, frii/riis, kaste",
        en: "Kebab, salad, fries/rice, sauce"
      },
      options: ["side"],
      variants: [
        { id: "small", name: { et: "Väike", en: "Small" }, price: 700 },
        { id: "large", name: { et: "Suur", en: "Large" }, price: 900 }
      ]
    },
    {
      id: "caesar-box",
      category: "mains",
      name: { et: "Caesar Box", en: "Caesar Box" },
      description: {
        et: "Kana kintsuliha kebab, salat, parmesan, caesar kaste",
        en: "Chicken thigh kebab, salad, parmesan, Caesar dressing"
      },
      variants: [{ id: "regular", price: 850 }]
    },
    {
      id: "crispy-chicken-box",
      category: "mains",
      name: { et: "Krõbekana Box", en: "Crispy Chicken Box" },
      description: {
        et: "Krõbekana, salat, frii/riis, kaste",
        en: "Crispy chicken, salad, fries/rice, sauce"
      },
      options: ["side"],
      variants: [{ id: "regular", price: 800 }]
    },
    {
      id: "fish-and-chips",
      category: "mains",
      name: { et: "Fish & Chips", en: "Fish & Chips" },
      description: {
        et: "Paneeritud tursafilee, frii/riis",
        en: "Breaded cod fillet, fries/rice"
      },
      options: ["side"],
      variants: [{ id: "regular", price: 850 }]
    },
    {
      id: "burgers",
      category: "mains",
      name: { et: "Burgerid / Kebabburgerid", en: "Burgers / Kebab Burgers" },
      variants: [
        {
          id: "burger",
          name: { et: "Burger", en: "Burger" },
          description: {
            et: "Pihv, juust, coleslaw salat, kaste",
            en: "Patty, cheese, coleslaw, sauce"
          },
          price: 700
        },
        {
          id: "kebab-burger",
          name: { et: "Kebabburger", en: "Kebab burger" },
          description: {
            et: "Kebab, salat, tomat, kurk, kaste",
            en: "Kebab, salad, tomato, cucumber, sauce"
          },
          price: 700
        }
      ]
    },
    {
      id: "pahlava",
      category: "desserts",
      name: { et: "Pahlava", en: "Baklava" },
      description: { et: "mmm… magus", en: "mmm… sweet" },
      variants: [{ id: "regular", price: 250 }]
    },
    {
      id: "ice-cream-cocktail",
      category: "desserts",
      featured: true,
      name: { et: "Jäätisekokteil", en: "Ice Cream Shake" },
      description: {
        et: "Vaniljejäätis + ploom/mango",
        en: "Vanilla ice cream + plum/mango"
      },
      variants: [
        { id: "plum", name: { et: "Ploom", en: "Plum" }, price: 400 },
        { id: "mango", name: { et: "Mango", en: "Mango" }, price: 400 }
      ]
    },
    {
      id: "water",
      category: "drinks",
      name: { et: "Vesi", en: "Water" },
      variants: [{ id: "regular", price: 200 }]
    },
    {
      id: "soft-drinks",
      category: "drinks",
      name: { et: "Coca / Fanta / Sprite", en: "Coca-Cola / Fanta / Sprite" },
      variants: [
        { id: "coca-cola", name: { et: "Coca-Cola", en: "Coca-Cola" }, price: 250 },
        { id: "fanta", name: { et: "Fanta", en: "Fanta" }, price: 250 },
        { id: "sprite", name: { et: "Sprite", en: "Sprite" }, price: 250 }
      ]
    }
  ]
};
