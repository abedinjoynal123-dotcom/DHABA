// Tests for POST /api/checkout (order form) with order storage simulated.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const saved: Record<string, any> = {};
mock.module("@netlify/blobs", {
  namedExports: {
    getStore: () => ({
      setJSON: async (key: string, value: unknown, opts?: { onlyIfNew?: boolean }) => {
        if (opts?.onlyIfNew && key in saved) return { modified: false };
        saved[key] = value;
        return { modified: true, etag: "x" };
      },
      get: async (key: string) => saved[key] ?? null,
      list: async () => ({ blobs: [] }),
    }),
  },
});

(globalThis as any).Netlify = { env: { get: () => undefined } };

const { default: checkout } = await import("../functions/checkout.mts");

const post = (body: unknown) =>
  checkout(new Request("http://localhost/api/checkout", { method: "POST", body: JSON.stringify(body) }));

const valid = {
  customer: { name: "Mari Maasikas", phone: "+372 5123 4567" },
  service: "takeaway",
  lang: "et",
  note: "Kiiresti palun",
  lines: [
    { item_id: "kebab-box", variant_id: "large", quantity: 2, side: "rice", note: "ilma sibulata" },
    { item_id: "soft-drinks", variant_id: "fanta", quantity: 1, side: null, note: null },
  ],
};

test("places an order priced on the server", async () => {
  const res = await post({ ...valid, total: 1 }); // a client total is ignored
  assert.equal(res.status, 200);
  const { order } = await res.json();
  assert.match(order.number, /^\d{3}$/);
  assert.equal(order.total, 2 * 900 + 250);
  assert.equal(order.lines[0].side, "Riis");

  const stored = Object.values(saved).at(-1);
  assert.equal(stored.channel, "web");
  assert.equal(stored.status, "new");
  assert.equal(stored.customer.name, "Mari Maasikas");
  assert.equal(stored.note, "Kiiresti palun");
  assert.equal(stored.lines[0].note, "ilma sibulata");
});

test("rejects missing or bad customer details", async () => {
  const count = Object.keys(saved).length;
  assert.equal((await (await post({ ...valid, customer: { name: " ", phone: "+372 5123 4567" } })).json()).error, "name_required");
  assert.equal((await (await post({ ...valid, customer: { name: "Mari", phone: "abc" } })).json()).error, "phone_invalid");
  assert.equal((await (await post({ ...valid, service: "delivery" })).json()).error, "service_required");
  assert.equal(Object.keys(saved).length, count);
});

test("rejects items, sizes and sides that are not on the menu", async () => {
  const bad = async (line: object) => {
    const res = await post({ ...valid, lines: [line] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_order");
  };
  await bad({ item_id: "pizza", variant_id: "regular", quantity: 1 });
  await bad({ item_id: "kebab-box", variant_id: "huge", quantity: 1, side: "rice" });
  await bad({ item_id: "kebab-box", variant_id: "small", quantity: 1 });
  await bad({ item_id: "water", variant_id: "regular", quantity: 0 });
  await bad({ item_id: "water", variant_id: "regular", quantity: 999 });
  assert.equal((await post({ ...valid, lines: [] })).status, 400);
});

test("rejects other methods and junk bodies", async () => {
  assert.equal((await checkout(new Request("http://localhost/api/checkout"))).status, 405);
  assert.equal((await checkout(new Request("http://localhost/api/checkout", { method: "POST", body: "{" }))).status, 400);
});
