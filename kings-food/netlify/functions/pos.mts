// /api/pos/* - the King's Food POS backend (the app itself is /staff/).
//
//   POST /api/pos/pair     {code}         pair this device with the owner STAFF_PIN
//   POST /api/pos/unpair                  forget this device
//   GET  /api/pos/boot                    paired? who is signed in? is AI set up?
//   POST /api/pos/setup    {name, pin}    create the first manager (only when there is none)
//   POST /api/pos/login    {id, pin}      sign a person in with their 4-digit PIN
//   POST /api/pos/logout
//   POST /api/pos/data     {keys: {key: etag}}   read collections / days of orders
//   POST /api/pos/write    {ops: [...]}   set / update / delete documents
//   POST /api/pos/number   {day, floor}   next order number for the day
//   POST /api/pos/asset    (image body)   store an invoice photo (managers)
//   GET  /api/pos/asset/<id>              show a stored photo (paired devices)
//   GET  /api/pos/ai/<job>                result of an AI request (see pos-ai.mts)
//
// Every POST needs the header "x-kf: 1" (blocks cross-site form posts).
import { randomBytes } from "node:crypto";
import type { Config } from "@netlify/functions";
import { tallinnDate } from "../lib/catalog.mts";
import {
  checkPin, clearCookies, deviceOk, endSessionCookie, liveSession, ownerCodeMatches, pairCookie, pinHash, session, sessionCookie,
} from "../lib/pos-auth.mts";
import {
  ID_RE, PosError, applyWrite, mutate, nextOrderNumber, posStore, readKey, readStaffRaw, wouldKeepManager, type WriteOp,
} from "../lib/pos-data.mts";

const MAX_BODY = 1_500_000;
const MAX_ASSET = 8_000_000;
const MAX_KEYS = 130;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function json(status: number, body: unknown, setCookies: string[] = []) {
  const headers = new Headers({ "cache-control": "no-store", "content-type": "application/json" });
  for (const c of setCookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

async function body<T>(req: Request): Promise<T> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new PosError(413, "too_large");
  try {
    return JSON.parse(raw || "{}") as T;
  } catch {
    throw new PosError(400, "bad_request");
  }
}

const aiReady = () => !!Netlify.env.get("ANTHROPIC_API_KEY");

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/pos\/?/, "").replace(/\/$/, "");
  try {
    if (req.method === "POST" && req.headers.get("x-kf") !== "1") throw new PosError(403, "bad_origin");
    if (!Netlify.env.get("STAFF_PIN")) throw new PosError(503, "not_configured");

    if (path === "pair" && req.method === "POST") {
      const b = await body<{ code?: unknown }>(req);
      // Slow down guessing: 10 wrong codes in a row lock pairing for 15 minutes.
      const lockKey = "auth/_pair";
      const lock = ((await posStore().get(lockKey, { type: "json" })) as { fails: number; until: number } | null) ?? { fails: 0, until: 0 };
      if (lock.until > Date.now()) throw new PosError(429, "pair_locked");
      if (!ownerCodeMatches(b.code)) {
        const fails = lock.fails + 1;
        await posStore().setJSON(lockKey, fails >= 10 ? { fails: 0, until: Date.now() + 15 * 60_000 } : { fails, until: 0 });
        await new Promise((r) => setTimeout(r, 600));
        throw new PosError(401, "wrong_code");
      }
      if (lock.fails) await posStore().delete(lockKey);
      return json(200, { ok: true }, [pairCookie(req)]);
    }
    if (path === "unpair" && req.method === "POST") return json(200, { ok: true }, clearCookies(req));

    if (!deviceOk(req)) {
      if (path === "boot") return json(200, { paired: false });
      throw new PosError(401, "not_paired");
    }
    const ses = session(req);
    const today = tallinnDate();

    if (path === "boot" && req.method === "GET") {
      const staff = await readStaffRaw();
      return json(200, {
        paired: true,
        session: ses ? { id: ses.sid, role: ses.role, name: ses.name } : null,
        hasManager: wouldKeepManager(staff),
        ai: aiReady(),
        today,
      });
    }

    if (path === "setup" && req.method === "POST") {
      const b = await body<{ name?: unknown; pin?: unknown }>(req);
      const name = typeof b.name === "string" ? b.name.trim().slice(0, 30) : "";
      const pin = typeof b.pin === "string" ? b.pin : "";
      if (!name) throw new PosError(400, "name_required");
      if (!/^\d{4}$/.test(pin)) throw new PosError(400, "pin_format");
      const id = "st" + Date.now().toString(36) + randomBytes(3).toString("hex");
      const salt = randomBytes(12).toString("hex");
      await mutate("c/staff", (docs) => {
        if (wouldKeepManager(docs)) throw new PosError(409, "already_set_up");
        docs[id] = { name, role: "manager", salt, pinHash: pinHash(salt, pin), active: true, createdAt: Date.now() };
      });
      return json(200, { member: { id, name, role: "manager" } }, [sessionCookie(req, { sid: id, role: "manager", name })]);
    }

    if (path === "login" && req.method === "POST") {
      const b = await body<{ id?: unknown; pin?: unknown }>(req);
      const id = typeof b.id === "string" && ID_RE.test(b.id) ? b.id : "";
      const r = await checkPin(id, typeof b.pin === "string" ? b.pin : "");
      if (!r.ok) return json(401, { error: "wrong_pin", wait: r.wait });
      return json(200, { member: { id, name: r.name, role: r.role } }, [sessionCookie(req, { sid: id, role: r.role, name: r.name })]);
    }
    if (path === "logout" && req.method === "POST") return json(200, { ok: true }, [endSessionCookie(req)]);

    if (path === "data" && req.method === "POST") {
      const b = await body<{ keys?: Record<string, string> }>(req);
      const keys = Object.entries(b.keys && typeof b.keys === "object" ? b.keys : {}).slice(0, MAX_KEYS);
      const results = await Promise.all(keys.map(([k, e]) => readKey(k, typeof e === "string" ? e : undefined, ses?.role ?? null, today)));
      return json(200, { results, session: ses ? { id: ses.sid, role: ses.role } : null, today });
    }

    if (path === "write" && req.method === "POST") {
      const live = await liveSession(req);
      if (!live) throw new PosError(401, "session");
      const b = await body<{ ops?: WriteOp[] }>(req);
      const ops = Array.isArray(b.ops) ? b.ops.slice(0, 200) : [];
      const touched = new Set<string>();
      for (const op of ops) touched.add(await applyWrite(op, live.role));
      const results = await Promise.all([...touched].map((k) => readKey(k, undefined, live.role, today)));
      return json(200, { results });
    }

    if (path === "number" && req.method === "POST") {
      const live = await liveSession(req);
      if (!live) throw new PosError(401, "session");
      const b = await body<{ day?: unknown; floor?: unknown }>(req);
      return json(200, { n: await nextOrderNumber(String(b.day ?? ""), Number(b.floor) || 0) });
    }

    if (path === "asset" && req.method === "POST") {
      const live = await liveSession(req);
      if (!live || live.role !== "manager") throw new PosError(403, "forbidden");
      const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!IMAGE_TYPES.includes(type)) throw new PosError(415, "bad_type");
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_ASSET) throw new PosError(413, "too_large");
      const id = "a" + Date.now().toString(36) + randomBytes(6).toString("hex");
      await posStore().set(`asset/${id}`, buf, { metadata: { type, by: live.sid, at: Date.now() } });
      return json(200, { id, url: `/api/pos/asset/${id}`, sizeBytes: buf.byteLength, contentType: type });
    }

    const am = /^asset\/(a[a-z0-9]{6,40})$/.exec(path);
    if (am && req.method === "GET") {
      if (!ses) throw new PosError(401, "session");
      const r = await posStore().getWithMetadata(`asset/${am[1]}`, { type: "arrayBuffer" });
      if (!r) throw new PosError(404, "not_found");
      const type = IMAGE_TYPES.includes(String(r.metadata?.type)) ? String(r.metadata.type) : "application/octet-stream";
      return new Response(r.data, {
        headers: { "content-type": type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
      });
    }

    const jm = /^ai\/([A-Za-z0-9_-]{8,64})$/.exec(path);
    if (jm && req.method === "GET") {
      if (!ses || ses.role !== "manager") throw new PosError(403, "forbidden");
      const key = `ai/${jm[1]}`;
      const r = (await posStore().get(key, { type: "json" })) as { sid?: string; done?: boolean } | null;
      if (!r || r.sid !== ses.sid) return json(200, { done: false });
      if (r.done) await posStore().delete(key);
      return json(200, r);
    }

    throw new PosError(404, "not_found");
  } catch (err) {
    if (err instanceof PosError) {
      const cookiesOut = err.code === "not_paired" ? clearCookies(req) : [];
      return json(err.status, { error: err.code }, cookiesOut);
    }
    console.error("POS error", err);
    return json(500, { error: "failed" });
  }
};

export const config: Config = {
  path: ["/api/pos/*"],
  rateLimit: { windowLimit: 240, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
