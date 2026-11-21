// POS data kept in Netlify Blobs (EU). Small collections are one JSON blob
// each ("c/<collection>" -> { docs: { id: data } }); till orders are one blob
// per Tallinn day ("o/<YYYY-MM-DD>"). Website orders stay in the "orders"
// store written by /api/checkout and are shown to the POS as read-mostly
// docs; what staff change on them (status, payment) goes to "w/<day>".
// Every write is a compare-and-swap on the blob's ETag, so two tills saving
// at the same moment never overwrite each other.
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { MENU } from "./catalog.mts";
import { listOrders, updateStatus, type Order, type Status } from "./orders-store.mts";

export type Doc = Record<string, unknown>;
export type Docs = Record<string, Doc>;
export type Role = "manager" | "staff";

export const COLLECTIONS = ["menu", "settings", "staff", "shifts", "inv", "invmoves", "invoices", "days", "counters"] as const;
export type Collection = (typeof COLLECTIONS)[number];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DOC_BYTES = 200_000;
const MAX_BLOB_BYTES = 4_500_000;

export function posStore() {
  return getStore({ name: "pos", region: "eu-central-1", consistency: "strong" } as any);
}

export class PosError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- keys ----------
export type Key = { kind: "c"; coll: Collection } | { kind: "o"; day: string };

export function parseKey(key: string): Key {
  if (key.startsWith("c/")) {
    const coll = key.slice(2) as Collection;
    if (COLLECTIONS.includes(coll)) return { kind: "c", coll };
  }
  if (key.startsWith("o/") && DAY_RE.test(key.slice(2))) return { kind: "o", day: key.slice(2) };
  throw new PosError(400, "bad_key");
}

// Till order ids carry their day: "o20261121_xxxx". Website orders: "w2026-11-21-583".
export function orderDay(id: string): string | null {
  let m = /^o(\d{4})(\d{2})(\d{2})_[A-Za-z0-9]{1,40}$/.exec(id);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^w(\d{4}-\d{2}-\d{2})-\d{3}$/.exec(id);
  return m ? m[1] : null;
}
const isWebId = (id: string) => id.startsWith("w");

// ---------- permissions ----------
// No session (a paired device on the lock screen or the customer screen) may
// read only what the lock and pickup screens show.
export function canRead(key: Key, role: Role | null, today: string): boolean {
  if (role) return true;
  if (key.kind === "c") return key.coll === "menu" || key.coll === "settings" || key.coll === "staff";
  return Math.abs(Date.parse(key.day) - Date.parse(today)) <= 86_400_000;
}

export function canWrite(coll: Collection | "orders", op: "set" | "update" | "delete", role: Role | null, data?: Doc): boolean {
  if (!role) return false;
  if (role === "manager") return true;
  if (coll === "orders") return op !== "delete";
  if (coll === "shifts") return op !== "delete";
  if (coll === "menu") return op === "update" && !!data && Object.keys(data).every((k) => k === "soldOut");
  return false;
}

// PIN hashes never leave the server.
function publicDoc(coll: Collection, d: Doc): Doc {
  if (coll !== "staff") return d;
  const { salt, pinHash, ...rest } = d;
  return { ...rest, hasPin: !!pinHash };
}

// ---------- blob helpers ----------
type Box = { docs: Docs };

async function readBox(key: string): Promise<{ box: Box | null; etag?: string }> {
  const r = await posStore().getWithMetadata(key, { type: "json" });
  if (!r) return { box: null };
  return { box: (r.data as Box) ?? { docs: {} }, etag: r.etag };
}

// Read-modify-write with optimistic concurrency.
export async function mutate(key: string, fn: (docs: Docs) => void): Promise<{ docs: Docs; etag: string }> {
  const s = posStore();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { box, etag } = await readBox(key);
    const docs: Docs = { ...(box?.docs ?? {}) };
    fn(docs);
    const body = { docs };
    if (JSON.stringify(body).length > MAX_BLOB_BYTES) throw new PosError(413, "too_large");
    const res = etag ? await s.setJSON(key, body, { onlyIfMatch: etag }) : await s.setJSON(key, body, { onlyIfNew: true });
    if (res.modified) return { docs, etag: res.etag ?? "" };
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 * (attempt + 1)));
  }
  throw new PosError(409, "busy");
}

// ---------- menu seed ----------
// The first time the till opens, its menu is filled from the website menu so
// nobody has to type it in. After that the till menu is edited in the POS.
export function seedMenu(): Docs {
  const cats = Object.fromEntries(MENU.categories.map((c) => [c.id, c.name.et]));
  const sides = MENU.options?.side?.choices.map((c) => c.name.et) ?? [];
  const docs: Docs = {};
  let order = 1;
  for (const item of MENU.items) {
    for (const v of item.variants) {
      const id = `m_${item.id}${item.variants.length > 1 ? "_" + v.id : ""}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
      docs[id] = {
        name: item.name.et + (item.variants.length > 1 && v.name ? " " + v.name.et : ""),
        cat: cats[item.category] ?? item.category,
        price: v.price / 100,
        order: order++,
        active: item.available !== false,
        ...(item.options?.includes("side") && sides.length ? { options: sides } : {}),
      };
    }
  }
  return docs;
}

// ---------- website orders ----------
function hash(s: string) {
  return createHash("sha1").update(s).digest("base64url").slice(0, 16);
}

export function webToPos(o: Order, extra: Doc = {}): Doc {
  const status = o.status === "completed" ? "done" : o.status;
  const notes = [o.note, ...o.lines.filter((l) => l.note).map((l) => `${l.name}: ${l.note}`)].filter(Boolean);
  return {
    num: Number(o.number),
    day: o.date,
    createdAt: Date.parse(o.createdAt),
    channel: "Web",
    payment: "Web",
    dine: o.service === "eat_in" ? "Eat in" : "Takeaway",
    ref: o.customer.name,
    phone: o.customer.phone,
    items: o.lines.map((l) => ({
      name: l.name + (l.variantName ? " " + l.variantName : ""),
      qty: l.quantity,
      price: l.unitPrice / 100,
      ...(l.sideName ? { option: l.sideName } : {}),
    })),
    total: o.total / 100,
    note: notes.join(" · "),
    ...extra,
    // The website order record stays the source of truth for status.
    status,
  };
}

const STATUS_FROM_POS: Record<string, Status> = { new: "new", preparing: "preparing", ready: "ready", done: "completed", cancelled: "cancelled" };

async function webSignature(day: string): Promise<string> {
  const [orders, overlay] = await Promise.all([
    getStore({ name: "orders", region: "eu-central-1", consistency: "strong" } as any).list({ prefix: `${day}/` }),
    posStore().getMetadata(`w/${day}`),
  ]);
  return hash(orders.blobs.map((b) => b.key + b.etag).join(",") + "|" + (overlay?.etag ?? ""));
}

async function webDocs(day: string): Promise<Docs> {
  const [orders, ov] = await Promise.all([listOrders(day), readBox(`w/${day}`)]);
  const extra = ov.box?.docs ?? {};
  const docs: Docs = {};
  for (const o of orders) {
    const id = `w${o.date}-${o.number}`;
    docs[id] = webToPos(o, extra[id] ?? {});
  }
  return docs;
}

// ---------- reads ----------
export interface ReadResult {
  key: string;
  etag: string;
  docs?: Record<string, Doc>;
  same?: boolean;
  denied?: boolean;
}

export async function readKey(keyStr: string, known: string | undefined, role: Role | null, today: string): Promise<ReadResult> {
  const key = parseKey(keyStr);
  if (!canRead(key, role, today)) return { key: keyStr, etag: "", denied: true };
  const s = posStore();
  if (key.kind === "c") {
    const meta = await s.getMetadata(keyStr);
    if (!meta && key.coll === "menu") {
      await s.setJSON(keyStr, { docs: seedMenu() }, { onlyIfNew: true });
      return readKey(keyStr, undefined, role, today);
    }
    const etag = meta?.etag ?? "none";
    if (known && known === etag) return { key: keyStr, etag, same: true };
    const { box, etag: e2 } = await readBox(keyStr);
    const docs = box?.docs ?? {};
    const out: Docs = {};
    for (const [id, d] of Object.entries(docs)) out[id] = publicDoc(key.coll, d);
    return { key: keyStr, etag: e2 ?? etag, docs: out };
  }
  const [meta, webSig] = await Promise.all([s.getMetadata(keyStr), webSignature(key.day)]);
  const etag = (meta?.etag ?? "none") + "~" + webSig;
  if (known && known === etag) return { key: keyStr, etag, same: true };
  const [{ box }, web] = await Promise.all([readBox(keyStr), webDocs(key.day)]);
  return { key: keyStr, etag, docs: { ...(box?.docs ?? {}), ...web } };
}

// ---------- writes ----------
export interface WriteOp {
  op: "set" | "update" | "delete";
  coll: string;
  id: string;
  data?: Doc;
}

function cleanData(d: unknown): Doc {
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new PosError(400, "bad_data");
  if (JSON.stringify(d).length > MAX_DOC_BYTES) throw new PosError(413, "doc_too_large");
  return d as Doc;
}

export async function applyWrite(w: WriteOp, role: Role | null): Promise<string> {
  if (!["set", "update", "delete"].includes(w.op)) throw new PosError(400, "bad_op");
  if (typeof w.id !== "string" || !ID_RE.test(w.id)) throw new PosError(400, "bad_id");
  const data = w.op === "delete" ? undefined : cleanData(w.data);

  if (w.coll === "orders") {
    if (!canWrite("orders", w.op, role, data)) throw new PosError(403, "forbidden");
    const day = orderDay(w.id);
    if (!day) throw new PosError(400, "bad_id");
    if (isWebId(w.id)) {
      if (w.op !== "update") throw new PosError(400, "web_order_readonly");
      const number = w.id.slice(-3);
      const status = data!.status !== undefined ? STATUS_FROM_POS[String(data!.status)] : undefined;
      if (data!.status !== undefined && !status) throw new PosError(400, "bad_status");
      if (status) {
        const updated = await updateStatus(day, number, status);
        if (!updated) throw new PosError(404, "not_found");
      }
      await mutate(`w/${day}`, (docs) => {
        docs[w.id] = { ...(docs[w.id] ?? {}), ...data };
      });
      return `o/${day}`;
    }
    if (data && data.day !== undefined && data.day !== day) throw new PosError(400, "day_mismatch");
    await mutate(`o/${day}`, (docs) => apply(docs, w.op, w.id, data));
    return `o/${day}`;
  }

  if (!COLLECTIONS.includes(w.coll as Collection)) throw new PosError(400, "bad_collection");
  const coll = w.coll as Collection;
  if (!canWrite(coll, w.op, role, data)) throw new PosError(403, "forbidden");
  await mutate(`c/${coll}`, (docs) => {
    if (coll === "staff" && data && w.op !== "delete") {
      // Keep the PIN unless a new one is given, and never accept a half one.
      const cur = docs[w.id] ?? {};
      const hasNew = typeof data.pinHash === "string" && typeof data.salt === "string";
      if ((data.pinHash !== undefined || data.salt !== undefined) && !hasNew) throw new PosError(400, "bad_pin");
      if (hasNew && !/^[a-f0-9]{64}$/.test(String(data.pinHash))) throw new PosError(400, "bad_pin");
      const next = w.op === "set" ? { ...data } : { ...cur, ...data };
      if (!hasNew) {
        next.salt = cur.salt;
        next.pinHash = cur.pinHash;
      }
      delete next.hasPin;
      if (!next.pinHash) throw new PosError(400, "pin_required");
      if (!wouldKeepManager({ ...docs, [w.id]: next })) throw new PosError(400, "last_manager");
      docs[w.id] = next;
      return;
    }
    if (coll === "staff" && w.op === "delete" && !wouldKeepManager(Object.fromEntries(Object.entries(docs).filter(([k]) => k !== w.id)))) {
      throw new PosError(400, "last_manager");
    }
    apply(docs, w.op, w.id, data);
  });
  return `c/${coll}`;
}

function apply(docs: Docs, op: WriteOp["op"], id: string, data?: Doc) {
  if (op === "delete") delete docs[id];
  else if (op === "set") docs[id] = { ...data };
  else {
    if (!docs[id]) throw new PosError(404, "not_found");
    docs[id] = { ...docs[id], ...data };
  }
}

export function wouldKeepManager(docs: Docs): boolean {
  return Object.values(docs).some((d) => d && d.role === "manager" && d.active !== false && d.pinHash);
}

// Order numbers count up per day across all tills (website orders have their own 3-digit numbers).
export async function nextOrderNumber(day: string, floor: number): Promise<number> {
  if (!DAY_RE.test(day)) throw new PosError(400, "bad_day");
  let n = 0;
  const { box } = await readBox(`o/${day}`);
  const highest = Object.values(box?.docs ?? {}).reduce((mx, d) => Math.max(mx, Number(d.num) || 0), 0);
  await mutate("c/counters", (docs) => {
    const cur = Number(docs[day]?.n) || 0;
    n = Math.max(cur, highest, Math.floor(Number(floor) || 0)) + 1;
    docs[day] = { n, day };
  });
  return n;
}

export async function readStaffRaw(): Promise<Docs> {
  const { box } = await readBox("c/staff");
  return box?.docs ?? {};
}
