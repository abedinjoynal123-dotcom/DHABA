import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU, OrderError, orderingClosedReason, priceOrder, tallinnDate, type Site, SITE } from "./catalog.mts";

const line = (item_id: string, variant_id: string, quantity = 1, side: string | null = null) => ({
  item_id,
  variant_id,
  quantity,
  side,
  note: null,
});

test("prices every menu item exactly as printed", () => {
  const printed: Record<string, number[]> = {
    shaurma: [790],
    "kebab-box": [700, 900],
    "caesar-box": [850],
    "crispy-chicken-box": [800],
    "fish-and-chips": [850],
    burgers: [700, 700],
    pahlava: [250],
    "ice-cream-cocktail": [400, 400],
    water: [200],
    "soft-drinks": [250, 250, 250],
  };
  assert.deepEqual(Object.keys(printed).sort(), MENU.items.map((i) => i.id).sort());
  for (const item of MENU.items) assert.deepEqual(item.variants.map((v) => v.price), printed[item.id], item.id);
});

test("totals a mixed order in cents", () => {
  const order = priceOrder([
    line("shaurma", "regular", 2),
    line("kebab-box", "large", 1, "rice"),
    line("soft-drinks", "fanta", 3),
  ]);
  assert.equal(order.total, 2 * 790 + 900 + 3 * 250);
  assert.equal(order.lines[1].sideName, "Rice");
});

test("single-variant items accept an empty variant id", () => {
  assert.equal(priceOrder([line("water", "")]).total, 200);
});

test("rejects unknown items, wrong variants, missing sides and bad quantities", () => {
  assert.throws(() => priceOrder([line("pizza", "regular")]), OrderError);
  assert.throws(() => priceOrder([line("kebab-box", "medium", 1, "fries")]), OrderError);
  assert.throws(() => priceOrder([line("kebab-box", "small")]), /fries or rice/);
  assert.throws(() => priceOrder([line("shaurma", "regular", 0)]), OrderError);
  assert.throws(() => priceOrder([line("shaurma", "regular", 1.5)]), OrderError);
  assert.throws(() => priceOrder([]), OrderError);
});

test("ignores a side on items that do not take one", () => {
  const order = priceOrder([line("shaurma", "regular", 1, "rice")]);
  assert.equal(order.lines[0].side, null);
});

test("business date follows Tallinn time", () => {
  // 22:30 UTC on 18 Oct is 01:30 on 19 Oct in Tallinn (UTC+3, summer time).
  assert.equal(tallinnDate(new Date("2026-10-18T22:30:00Z")), "2026-10-19");
  assert.equal(tallinnDate(new Date("2026-10-18T12:00:00Z")), "2026-10-18");
});

test("ordering follows opening hours when they are set", () => {
  const site: Site = { ...SITE, hours: { sun: ["11:00", "21:00"], mon: "closed" }, ordering: { ...SITE.ordering, enabled: true } };
  // Sunday 18 Oct 2026, 12:00 Tallinn = 09:00 UTC
  assert.equal(orderingClosedReason(new Date("2026-10-18T09:00:00Z"), site), null);
  // Sunday 22:00 Tallinn
  assert.match(orderingClosedReason(new Date("2026-10-18T19:00:00Z"), site) ?? "", /11:00 to 21:00/);
  // Monday
  assert.match(orderingClosedReason(new Date("2026-10-19T09:00:00Z"), site) ?? "", /closed today/);
  // No hours configured: open
  assert.equal(orderingClosedReason(new Date("2026-10-19T09:00:00Z"), { ...site, hours: {} }), null);
  // Switched off
  assert.match(orderingClosedReason(new Date(), { ...site, hours: {}, ordering: { ...site.ordering, enabled: false } }) ?? "", /switched off/);
});
