// Tests for the POS API (/api/pos/*) with storage simulated in memory.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore plain JS helper shared with the local dev server
import { blobsModule } from "../../scripts/blobs-memory.mjs";

mock.module("@netlify/blobs", { namedExports: blobsModule });
const env: Record<string, string> = { STAFF_PIN: "123456" };
(globalThis as any).Netlify = { env: { get: (k: string) => env[k] } };

const { default: pos } = await import("../functions/pos.mts");
const { default: checkout } = await import("../functions/checkout.mts");

type Jar = Record<string, string>;
async function call(jar: Jar, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await pos(
    new Request("https://kf.test/api/pos/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-kf": "1", "content-type": "application/json", cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  for (const c of res.headers.getSetCookie()) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    if (c.includes("Max-Age=0")) delete jar[k];
    else jar[k] = v;
  }
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

const owner: Jar = {};
const staffJar: Jar = {};
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Tallinn" }).format(new Date());
const sha = async (s: string) => (await import("node:crypto")).createHash("sha256").update(s).digest("hex");

test("an unpaired device gets nothing", async () => {
  assert.deepEqual((await call({}, "boot")).body, { paired: false });
  assert.equal((await call({}, "data", { keys: { "c/menu": "" } })).status, 401);
  assert.equal((await call({}, "pair", { code: "999999" })).status, 401);
});

test("POSTs without the x-kf header are refused", async () => {
  assert.equal((await call({}, "pair", { code: "123456" }, { "x-kf": "0" })).status, 403);
});

test("pairing, first manager and sign-in", async () => {
  assert.equal((await call(owner, "pair", { code: "123456" })).status, 200);
  assert.ok(owner.kf_dev);
  assert.equal((await call(owner, "boot")).body.hasManager, false);
  const s = await call(owner, "setup", { name: "Abedin", pin: "1234" });
  assert.equal(s.status, 200);
  assert.equal((await call(owner, "setup", { name: "Second", pin: "1111" })).status, 409, "only one first manager");
  assert.equal((await call(owner, "boot")).body.session.role, "manager");
});

test("menu is seeded from the website menu", async () => {
  const r = await call(owner, "data", { keys: { "c/menu": "" } });
  const names = Object.values(r.body.results[0].docs).map((d: any) => d.name);
  assert.ok(names.includes("Shaurma"));
  assert.ok(names.includes("Kebab Box Väike") && names.includes("Kebab Box Suur"));
});

test("PIN hashes stay on the server; wrong PINs lock after five tries", async () => {
  const salt = "aa11";
  const w = await call(owner, "write", { ops: [{ op: "set", coll: "staff", id: "s1", data: { name: "Mari", role: "staff", salt, pinHash: await sha(`kingsfood:${salt}:5678`), active: true } }] });
  assert.equal(w.status, 200);
  assert.ok(!JSON.stringify(w.body).includes("pinHash"));
  Object.assign(staffJar, { kf_dev: owner.kf_dev });
  for (let i = 0; i < 4; i++) assert.equal((await call(staffJar, "login", { id: "s1", pin: "0000" })).status, 401);
  const locked = await call(staffJar, "login", { id: "s1", pin: "0000" });
  assert.ok(locked.body.wait > 0);
  assert.equal((await call(staffJar, "login", { id: "s1", pin: "5678" })).status, 401, "locked even with the right PIN");
});

test("staff can take orders and mark sold out, but not manage stock or staff", async () => {
  const jar: Jar = { kf_dev: owner.kf_dev };
  const salt = "bb22";
  await call(owner, "write", { ops: [{ op: "set", coll: "staff", id: "s2", data: { name: "Jaan", role: "staff", salt, pinHash: await sha(`kingsfood:${salt}:4321`), active: true } }] });
  assert.equal((await call(jar, "login", { id: "s2", pin: "4321" })).status, 200);
  const id = "o" + today.replace(/-/g, "") + "_abc123";
  assert.equal((await call(jar, "write", { ops: [{ op: "set", coll: "orders", id, data: { num: 1, day: today, total: 7.9, status: "new" } }] })).status, 200);
  assert.equal((await call(jar, "number", { day: today, floor: 0 })).body.n, 2);
  const menuId = Object.keys((await call(jar, "data", { keys: { "c/menu": "" } })).body.results[0].docs)[0];
  assert.equal((await call(jar, "write", { ops: [{ op: "update", coll: "menu", id: menuId, data: { soldOut: true } }] })).status, 200);
  assert.equal((await call(jar, "write", { ops: [{ op: "update", coll: "menu", id: menuId, data: { price: 0.1 } }] })).status, 403);
  assert.equal((await call(jar, "write", { ops: [{ op: "set", coll: "inv", id: "i1", data: { name: "x" } }] })).status, 403);
  assert.equal((await call(jar, "write", { ops: [{ op: "update", coll: "staff", id: "s2", data: { role: "manager" } }] })).status, 403);
  assert.equal((await call(jar, "ai/abcdefgh12")).status, 403);
});

test("the last manager can't be removed or demoted", async () => {
  const st = (await call(owner, "data", { keys: { "c/staff": "" } })).body.results[0].docs;
  const mgr = Object.entries(st).find(([, d]: any) => d.role === "manager")![0];
  assert.equal((await call(owner, "write", { ops: [{ op: "update", coll: "staff", id: mgr, data: { role: "staff" } }] })).status, 400);
  assert.equal((await call(owner, "write", { ops: [{ op: "delete", coll: "staff", id: mgr }] })).status, 400);
});

test("website orders appear in the POS and staff status changes reach them", async () => {
  const res = await checkout(new Request("https://kf.test/api/checkout", { method: "POST", body: JSON.stringify({
    customer: { name: "Kati", phone: "+372 5123 4567" }, service: "eat_in", lang: "et",
    lines: [{ item_id: "shaurma", variant_id: "regular", quantity: 1, side: null }] }) }));
  const { order } = (await res.json()) as any;
  const day = (await call(owner, "data", { keys: { ["o/" + today]: "" } })).body.results[0];
  const web = day.docs[`w${today}-${order.number}`];
  assert.equal(web.channel, "Web");
  assert.equal(web.dine, "Eat in");
  assert.equal(web.total, 7.9);
  const again = (await call(owner, "data", { keys: { ["o/" + today]: day.etag } })).body.results[0];
  assert.equal(again.same, true, "unchanged day is not re-sent");
  assert.equal((await call(owner, "write", { ops: [{ op: "update", coll: "orders", id: `w${today}-${order.number}`, data: { status: "done", payment: "Card" } }] })).status, 200);
  const after = (await call(owner, "data", { keys: { ["o/" + today]: "" } })).body.results[0].docs[`w${today}-${order.number}`];
  assert.equal(after.status, "done");
  assert.equal(after.payment, "Card");
  assert.equal((await call(owner, "write", { ops: [{ op: "delete", coll: "orders", id: `w${today}-${order.number}` }] })).status, 400);
});

test("without a signed-in person only the lock and pickup screens' data is readable", async () => {
  const jar: Jar = { kf_dev: owner.kf_dev };
  const r = await call(jar, "data", { keys: { "c/menu": "", "c/inv": "", "c/invoices": "", ["o/" + today]: "", "o/2020-01-01": "" } });
  const by = Object.fromEntries(r.body.results.map((x: any) => [x.key, x]));
  assert.ok(by["c/menu"].docs);
  assert.equal(by["c/inv"].denied, true);
  assert.equal(by["c/invoices"].denied, true);
  assert.ok(by["o/" + today].docs);
  assert.equal(by["o/2020-01-01"].denied, true);
});

test("invoice photos: managers upload, signed-in devices view", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = await pos(new Request("https://kf.test/api/pos/asset", { method: "POST", headers: { "x-kf": "1", "content-type": "image/png", cookie: `kf_dev=${owner.kf_dev}; kf_ses=${owner.kf_ses}` }, body: png }));
  const { id } = (await up.json()) as any;
  const get = await pos(new Request(`https://kf.test/api/pos/asset/${id}`, { headers: { cookie: `kf_dev=${owner.kf_dev}; kf_ses=${owner.kf_ses}` } }));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("content-type"), "image/png");
  const bad = await pos(new Request("https://kf.test/api/pos/asset", { method: "POST", headers: { "x-kf": "1", "content-type": "text/html", cookie: `kf_dev=${owner.kf_dev}; kf_ses=${owner.kf_ses}` }, body: "<b>" }));
  assert.equal(bad.status, 415);
});

test("a changed STAFF_PIN signs every device out", async () => {
  env.STAFF_PIN = "654321";
  assert.deepEqual((await call({ ...owner }, "boot")).body, { paired: false });
  env.STAFF_PIN = "123456";
});

test("the built POS page matches pos/src", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["pos/build.mjs", "--check"], { cwd: new URL("../../", import.meta.url).pathname, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
