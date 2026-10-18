// Live test of the deployed King's Food site.
//
//   BASE_URL=https://kings-food-tallinn.netlify.app STAFF_PIN=... node scripts/live-test.mjs
//
// Checks the pages and staff API, then has a real conversation with the AI
// assistant in Estonian, places one test order, finds it on the staff API and
// cancels it so it does not count in sales. Exits non-zero on any failure.

const BASE = (process.env.BASE_URL || "https://kings-food-tallinn.netlify.app").replace(/\/$/, "");
const PIN = process.env.STAFF_PIN || "";
const SKIP_ORDER = process.env.SKIP_ORDER === "1";

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

async function chat(history, text) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ history, text, lang: "et", channel: "chat" }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  // ---------- pages ----------
  const home = await get("/");
  record("Home page loads", home.status === 200 && home.text.includes("King's Food"), `HTTP ${home.status}`);
  record("Home page has chat ordering", home.text.includes("Telli vestluses") && home.text.includes("chat.js"));
  record("Phone number on page", home.text.includes("+372 5559 2222"));

  const menu = await get("/assets/data/menu.json");
  let items = 0;
  try { items = JSON.parse(menu.text).items.length; } catch {}
  record("Menu data", menu.status === 200 && items === 10, `HTTP ${menu.status}, ${items} items`);

  const staff = await get("/staff/");
  record("Staff page loads", staff.status === 200, `HTTP ${staff.status}`);

  // ---------- staff API ----------
  const noPin = await get("/api/orders");
  record("Orders API rejects missing PIN", noPin.status === 401, `HTTP ${noPin.status} ${noPin.text.slice(0, 80)}`);
  if (PIN) {
    const withPin = await get("/api/orders", { "x-staff-pin": PIN });
    record("Orders API accepts staff PIN", withPin.status === 200, `HTTP ${withPin.status} ${withPin.status === 200 ? "" : withPin.text.slice(0, 120)}`);
  }

  // ---------- AI conversation ----------
  console.log("\n--- AI conversation (Estonian) ---");
  let history = [];
  let order = null;

  const turn = async (text) => {
    const started = Date.now();
    const r = await chat(history, text);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nCustomer: ${text}`);
    if (r.status !== 200) {
      console.log(`  -> HTTP ${r.status} ${JSON.stringify(r.body)} (${secs}s)`);
      return r;
    }
    console.log(`Assistant (${secs}s): ${r.body.reply}`);
    history = r.body.history;
    if (r.body.order) {
      order = r.body.order;
      console.log(`  ORDER PLACED: #${order.number}, total ${(order.total / 100).toFixed(2)} €`);
    }
    return r;
  };

  const first = await turn("Tere! Mis teil menüüs on?");
  if (first.status === 503 && first.body.error === "not_configured") {
    record("AI assistant configured", false, "ANTHROPIC_API_KEY is not set on Netlify");
    return;
  }
  record("AI answers a menu question", first.status === 200 && !!first.body.reply, `HTTP ${first.status}`);
  if (first.status !== 200) return;

  const ask = await turn("Mis maksab suur kebab box?");
  record("AI quotes the large Kebab Box price (9,00 €)", ask.status === 200 && /9[,.]00|9 ?€|€ ?9/.test(ask.body.reply || ""), (ask.body.reply || "").slice(0, 120));

  if (SKIP_ORDER) return;

  await turn("Soovin üks suur kebab box riisiga ja üks Fanta, kaasa.");
  await turn("Nimi on Test Claude, telefon +372 5555 0000.");
  for (let i = 0; i < 4 && !order; i++) {
    await turn(i === 0 ? "Jah, kinnitan." : "Jah, see on õige. Palun esitage tellimus.");
  }

  record("AI placed the order after confirmation", !!order, order ? `#${order.number}` : "no order");
  if (!order) return;
  record("Order total is exactly 11,50 €", order.total === 1150, `${order.total} cents`);

  // ---------- staff side ----------
  if (!PIN) return;
  const list = await get("/api/orders", { "x-staff-pin": PIN });
  let saved = null;
  let date = null;
  try {
    const data = JSON.parse(list.text);
    date = data.date;
    saved = data.orders.find((o) => o.number === order.number);
  } catch {}
  record("Order appears on staff screen", !!saved && saved.status === "new" && saved.total === 1150 && saved.customer.name === "Test Claude",
    saved ? `status ${saved.status}, ${saved.lines.length} lines, ${saved.service}` : "not found");

  if (saved) {
    const res = await fetch(`${BASE}/api/orders`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-staff-pin": PIN },
      body: JSON.stringify({ date: saved.date || date, number: saved.number, status: "cancelled" }),
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
