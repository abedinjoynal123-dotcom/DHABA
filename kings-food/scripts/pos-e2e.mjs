// Browser test of the POS against the local dev server (needs Playwright).
//   node scripts/pos-e2e.mjs [baseUrl]     (start scripts/pos-dev-server.mjs first, STAFF_PIN=123456)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] || "http://localhost:8899";
const R = [];
const ERR = [];
const check = (n, ok, info = "") => { R.push([ok, n, info]); console.log(`${ok ? "PASS" : "FAIL"} | ${n}${ok || !info ? "" : " | " + String(info).slice(0, 200)}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const claude = (list) => fetch(BASE + "/__test/claude", { method: "POST", body: JSON.stringify(list) });

async function device(browser, w = 1280, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem("kf_lang", "en"); } catch (e) {} });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => ERR.push(String(e)));
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) ERR.push("console: " + m.text()); });
  return { ctx, pg };
}
async function pin(pg, digits) { for (const d of digits) await pg.click(`#lockBody .pad button[data-d="${d}"]`); }

const browser = await chromium.launch();
try {
  const { ctx, pg } = await device(browser);
  await pg.goto(BASE + "/staff/");
  await pg.waitForSelector(".pairsheet");
  check("unpaired device sees the connect screen", await pg.isVisible(".pairsheet input"));
  await pg.fill(".pairsheet input", "000000"); await pg.click(".pairsheet button");
  await pg.waitForFunction(() => document.querySelector(".pairsheet .perr").textContent.length > 0);
  check("wrong owner code refused", (await pg.textContent(".pairsheet .perr")).includes("Wrong"));
  await pg.fill(".pairsheet input", "123456"); await pg.click(".pairsheet button");
  await pg.waitForSelector("#setupForm", { timeout: 15000 });
  check("after pairing: first-manager setup", await pg.isVisible("#setupForm"));
  await pg.fill("#suName", "Abedin"); await pg.fill("#suPin", "1234"); await pg.fill("#suPin2", "1234"); await pg.click("#setupForm button[type=submit]");
  await pg.waitForSelector("#lock", { state: "hidden" });
  check("manager created and signed in", (await pg.textContent("#uName")) === "Abedin");
  await pg.waitForSelector(".tile");
  const tiles = await pg.locator(".tile").allTextContents();
  check("till menu seeded from the website menu", tiles.some((x) => x.includes("Shaurma")) && tiles.some((x) => x.includes("Kebab Box Suur")), tiles.slice(0, 4).join(" / "));

  // till order
  await pg.locator(".tile", { hasText: "Shaurma" }).first().click();
  await pg.click("#placeBtn");
  await pg.waitForSelector("#done:not([hidden])"); await pg.click("#doneOk");
  await pg.click("#tab-kitchen");
  await pg.waitForSelector("#s-new .card");
  check("till order #1 in kitchen", (await pg.textContent("#s-new .card .no")) === "#1");

  // website order
  const co = await fetch(BASE + "/api/checkout", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ customer: { name: "Kati Kask", phone: "+372 5123 4567" }, service: "takeaway", lang: "et", lines: [{ item_id: "kebab-box", variant_id: "large", quantity: 2, side: "fries" }] }) }).then((r) => r.json());
  check("website checkout works", !!co.order?.number, JSON.stringify(co));
  await pg.waitForFunction(() => /Website/.test(document.querySelector("#s-new").textContent), null, { timeout: 12000 });
  const card = pg.locator("#s-new .card", { hasText: "Website" });
  const ct = await card.textContent();
  check("website order shows in kitchen with name, items, side", ct.includes("Kati Kask") && ct.includes("2×") && ct.includes("Kebab Box Suur") && ct.includes("Frii"), ct.slice(0, 160));
  check("website order shows 'Pay at pickup'", ct.includes("Pay at pickup"));
  await card.locator("[data-next]").click(); await wait(600);
  await pg.locator("#s-preparing .card", { hasText: "Website" }).locator("[data-next]").click(); await wait(600);
  const ready = pg.locator("#s-ready .card", { hasText: "Website" });
  check("ready website order offers Paid card / Paid cash", (await ready.locator("[data-pay]").count()) === 2);
  await ready.locator('[data-pay="Card"]').click(); await wait(800);
  const legacy = await fetch(BASE + "/api/orders", { headers: { "x-staff-pin": "123456" } }).then((r) => r.json());
  const lo = legacy.orders.find((o) => o.number === co.order.number);
  check("handing over updates the website order to completed", lo?.status === "completed", lo?.status);
  await pg.click("#tab-sales"); await wait(500);
  const splits = await pg.textContent("#splits");
  check("sales: card payment from web order counted", (await pg.textContent("#k-cnt")) === "2" && splits.includes("Website"), splits);

  // second device sees the same data
  const d2 = await device(browser);
  await d2.pg.goto(BASE + "/staff/"); await d2.pg.waitForSelector(".pairsheet"); await d2.pg.fill(".pairsheet input", "123456"); await d2.pg.click(".pairsheet button");
  await d2.pg.waitForSelector("#lockBody .who button", { timeout: 15000 });
  await d2.pg.locator("#lockBody .who button", { hasText: "Abedin" }).click(); await pin(d2.pg, "1111");
  await d2.pg.waitForFunction(() => /Wrong/.test(document.querySelector("#lockBody .pinerr")?.textContent || ""));
  check("wrong PIN refused by the server", await d2.pg.isVisible("#lock"));
  await pin(d2.pg, "1234"); await d2.pg.waitForSelector("#lock", { state: "hidden" });
  await d2.pg.click("#tab-records"); await wait(1200);
  check("second tablet sees both orders", (await d2.pg.locator("#recRows tr.row").count()) === 2);

  // staff member
  await pg.click("#tab-staff"); await pg.click("#staffAdd");
  await pg.fill("#sfName", "Mari"); await pg.selectOption("#sfRole", "staff"); await pg.fill("#sfPin", "5678"); await pg.fill("#sfPin2", "5678");
  await pg.click("#staffForm button[type=submit]"); await wait(800);
  check("manager adds staff", (await pg.locator("#staffList .srow").count()) === 2);
  const staffDump = await pg.evaluate(() => fetch("/api/pos/data", { method: "POST", headers: { "content-type": "application/json", "x-kf": "1" }, body: JSON.stringify({ keys: { "c/staff": "" } }) }).then((r) => r.json()));
  check("PIN hashes never sent to browsers", !JSON.stringify(staffDump).includes("pinHash") && !JSON.stringify(staffDump).includes("salt"));
  await pg.click("#userChip"); await pg.click("#lockBtn");
  await pg.locator("#lockBody .who button", { hasText: "Mari" }).click(); await pin(pg, "5678");
  await pg.waitForSelector("#lock", { state: "hidden" });
  const vis = await Promise.all(["till", "kitchen", "pickup", "sales", "inventory", "ai", "staff"].map((v) => pg.isVisible("#tab-" + v)));
  check("staff sees only Till, Kitchen, Pickup", JSON.stringify(vis) === JSON.stringify([true, true, true, false, false, false, false]), JSON.stringify(vis));
  const forbidden = await pg.evaluate(() => fetch("/api/pos/write", { method: "POST", headers: { "content-type": "application/json", "x-kf": "1" }, body: JSON.stringify({ ops: [{ op: "set", coll: "inv", id: "x1", data: { name: "hack" } }] }) }).then((r) => r.status));
  check("server refuses staff writing inventory", forbidden === 403, forbidden);
  const ai403 = await pg.evaluate(() => fetch("/api/pos/ai/abcdefgh12", { cache: "no-store" }).then((r) => r.status));
  check("server refuses AI to staff", ai403 === 403, ai403);
  await pg.click("#tab-till"); await pg.click("#soldMode"); await pg.locator(".tile", { hasText: "Vesi" }).first().click(); await wait(600); await pg.click("#soldMode");
  check("staff can mark sold out", (await pg.locator(".tile.out", { hasText: "Vesi" }).count()) === 1);

  // back to manager: AI manager with a tool call
  await pg.click("#userChip"); await pg.click("#lockBtn");
  await pg.locator("#lockBody .who button", { hasText: "Abedin" }).click(); await pin(pg, "1234"); await pg.waitForSelector("#lock", { state: "hidden" });
  await claude([
    { content: [{ type: "text", text: "Checking." }, { type: "tool_use", id: "tu1", name: "get_sales", input: { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) } }], stop_reason: "tool_use" },
    { content: [{ type: "text", text: "**Today:** 2 orders so far." }], stop_reason: "end_turn" },
  ]);
  await pg.click("#tab-ai"); await wait(400);
  check("AI Manager available", (await pg.textContent("#aiStatus")).includes("live data"));
  await pg.fill("#aiInput", "How are we doing?"); await pg.press("#aiInput", "Enter");
  await pg.waitForFunction(() => /2 orders so far/.test(document.querySelector("#aiMsgs").textContent), null, { timeout: 20000 });
  const log = await fetch(BASE + "/__test/claude").then((r) => r.json());
  const last = log[log.length - 1];
  check("Claude got system prompt, tools and the tool result", log.length === 2 && last.system.includes("King's Food AI Manager") && last.tools.some((t) => t.name === "get_sales") && JSON.stringify(last.messages).includes("revenue_incl_vat"));
  check("AI answer rendered", (await pg.innerHTML("#aiMsgs .aim.a .amd")).includes("<b>Today:</b>"));

  // invoice scan with photo
  await claude([{ content: [{ type: "text", text: JSON.stringify({ supplier: "Sanitex", invoiceNumber: "S-1", date: "2026-11-20", netTotal: 60, vatTotal: 14.4, grandTotal: 74.4,
    lines: [{ text: "KANAKINTSULIHA 10KG", qty: 1, unit: "kast", unitPrice: 60, lineTotal: 60, kind: "product", itemId: null, stockQty: null, suggestName: "Kanakintsuliha", suggestUnit: "kg", confidence: "high" }] }) }], stop_reason: "end_turn" }]);
  await pg.click("#tab-inventory");
  await pg.setInputFiles("#invFile", { name: "inv.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await pg.waitForSelector("[data-sapply]", { timeout: 20000 });
  await pg.fill('[data-li="0"] [data-lk=stockQty]', "10"); await pg.dispatchEvent('[data-li="0"] [data-lk=stockQty]', "input");
  await pg.click("[data-sapply]"); await pg.waitForSelector(".sdone"); await pg.click("[data-sclose]");
  await pg.click('#invTabs [data-it=invoices]'); await wait(500);
  const img = await pg.getAttribute(".ivthumb", "src");
  const imgStatus = await pg.evaluate((u) => fetch(u).then((r) => r.status + " " + r.headers.get("content-type")), img);
  check("invoice saved with photo served from the server", /^\/api\/pos\/asset\//.test(img || "") && imgStatus === "200 image/png", img + " " + imgStatus);
  const scanReq = (await fetch(BASE + "/__test/claude").then((r) => r.json())).pop();
  check("invoice photo sent to Claude as an image", JSON.stringify(scanReq.messages).includes('"type":"image"'));
  await pg.click('#invTabs [data-it=stock]'); await wait(300);
  check("stock added from invoice", (await pg.textContent("#invRows")).includes("Kanakintsuliha"));

  // session expiry: server session gone -> app locks
  await ctx.clearCookies({ name: "kf_ses" });
  await pg.click("#tab-till"); await pg.locator(".tile", { hasText: "Shaurma" }).first().click(); await pg.click("#placeBtn");
  await pg.waitForSelector("#lock:not([hidden])", { timeout: 8000 }).catch(() => {});
  check("lost server session sends the till back to the lock screen", await pg.isVisible("#lock"));

  // customer screen with no PIN
  await pg.click("#displayBtn"); await wait(800);
  check("customer screen works without a PIN", await pg.isVisible("#screen"));

  // unpaired device is refused by the API
  const anon = await browser.newContext(); const ap = await anon.newPage();
  const st = await ap.evaluate((b) => fetch(b + "/api/pos/data", { method: "POST", headers: { "content-type": "application/json", "x-kf": "1" }, body: "{\"keys\":{\"c/menu\":\"\"}}" }).then((r) => r.status), BASE).catch(() => 0);
  await ap.goto(BASE + "/staff/"); const st2 = await ap.evaluate(() => fetch("/api/pos/data", { method: "POST", headers: { "content-type": "application/json", "x-kf": "1" }, body: "{\"keys\":{\"c/menu\":\"\"}}" }).then((r) => r.status));
  check("unpaired browser gets nothing from the POS API", st2 === 401, st2);

  // phone layout
  const ph = await device(browser, 390, 800);
  await ph.pg.goto(BASE + "/staff/"); await ph.pg.waitForSelector(".pairsheet");
  check("connect screen fits a phone", (await ph.pg.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await pg.screenshot({ path: process.env.SHOT || "/tmp/pos-e2e.png" });
} finally {
  await browser.close();
}
const failed = R.filter((r) => !r[0]).length;
console.log(`\n${R.length - failed}/${R.length} passed`);
if (ERR.length) console.log("Page errors:", ERR);
process.exit(failed || ERR.length ? 1 : 0);
