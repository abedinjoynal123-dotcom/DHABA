// Live test of the deployed King's Food site.
//
//   BASE_URL=https://kingsfoodeatonia.netlify.app STAFF_PIN=... node scripts/live-test.mjs
//
// Checks the pages, the order form API and the staff API. With a staff PIN
// (and SKIP_ORDER unset) it also places one real test order through the order
// form API, finds it on the staff API and cancels it so it does not count in
// sales. Exits non-zero on any failure.

const BASE = (process.env.BASE_URL || "https://kingsfoodeatonia.netlify.app").replace(/\/$/, "");
const PIN = process.env.STAFF_PIN || "";
const SKIP_ORDER = process.env.SKIP_ORDER === "1" || !PIN;

let failures = 0;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function get(path, headers = {}) {
  const res = await fetch(BASE + path, { headers, cache: "no-store" });
  const text = await res.text();
  return { status: res.status, text };
}

async function checkout(body) {
  const res = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const TEST_ORDER = {
  customer: { name: "Test Claude", phone: "+372 5555 0000" },
  service: "takeaway",
  lang: "et",
  note: "Automaattest, tühistatakse kohe",
  lines: [
    { item_id: "kebab-box", variant_id: "large", quantity: 1, side: "rice", note: null },
    { item_id: "soft-drinks", variant_id: "fanta", quantity: 1, side: null, note: null },
  ],
};

async function main() {
  console.log(`Testing ${BASE}\n`);

  // ---------- pages ----------
  const home = await get("/");
  record("Home page loads", home.status === 200 && home.text.includes("King's Food"), `HTTP ${home.status}`);
  record("Home page has the order form", home.text.includes("order.js"));
  record("Phone number on page", home.text.includes("+372 5559 2222"));

  const menu = await get("/assets/data/menu.json");
  let items = 0;
  try { items = JSON.parse(menu.text).items.length; } catch {}
  record("Menu data", menu.status === 200 && items === 10, `HTTP ${menu.status}, ${items} items`);

  const staff = await get("/staff/");
  record("Staff page loads", staff.status === 200, `HTTP ${staff.status}`);

  // ---------- order form API (validation, nothing is saved) ----------
  const bad = await checkout({ ...TEST_ORDER, customer: { name: "Test", phone: "abc" } });
  record("Order form rejects a bad phone number", bad.status === 400 && bad.body.error === "phone_invalid", `HTTP ${bad.status} ${JSON.stringify(bad.body)}`);
  const badItem = await checkout({ ...TEST_ORDER, lines: [{ item_id: "pizza", variant_id: "regular", quantity: 1 }] });
  record("Order form rejects items not on the menu", badItem.status === 400 && badItem.body.error === "invalid_order", `HTTP ${badItem.status}`);

  // ---------- staff API ----------
  const noPin = await get("/api/orders");
  record("Orders API rejects missing PIN", noPin.status === 401, `HTTP ${noPin.status} ${noPin.text.slice(0, 80)}`);
  if (PIN) {
    const withPin = await get("/api/orders", { "x-staff-pin": PIN });
    record("Orders API accepts staff PIN", withPin.status === 200, `HTTP ${withPin.status} ${withPin.status === 200 ? "" : withPin.text.slice(0, 120)}`);
  }

  if (SKIP_ORDER) {
    console.log("\nNo staff PIN given: skipped placing a real test order.");
    return;
  }

  // ---------- real order, then cancel ----------
  const placed = await checkout(TEST_ORDER);
  const order = placed.body.order;
  record("Order form places an order", placed.status === 200 && /^\d{3}$/.test(order?.number ?? ""), `HTTP ${placed.status} ${order ? "#" + order.number : JSON.stringify(placed.body)}`);
  if (!order) return;
  record("Order total is exactly 11,50 €", order.total === 1150, `${order.total} cents`);

  const list = await get("/api/orders", { "x-staff-pin": PIN });
  let saved = null;
  try { saved = JSON.parse(list.text).orders.find((o) => o.number === order.number); } catch {}
  record("Order appears on staff screen", !!saved && saved.status === "new" && saved.total === 1150 && saved.customer.name === "Test Claude",
    saved ? `status ${saved.status}, ${saved.lines.length} lines, ${saved.service}` : "not found");

  if (saved) {
    const res = await fetch(`${BASE}/api/orders`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-staff-pin": PIN },
      body: JSON.stringify({ date: saved.date, number: saved.number, status: "cancelled" }),
    });
    const body = await res.json().catch(() => ({}));
    record("Test order cancelled", res.status === 200 && body.order?.status === "cancelled", `HTTP ${res.status}`);
  }
}

main()
  .catch((err) => record("Test run", false, String(err)))
  .finally(() => {
    console.log(`\n${results.length - failures}/${results.length} checks passed`);
    process.exit(failures ? 1 : 0);
  });
