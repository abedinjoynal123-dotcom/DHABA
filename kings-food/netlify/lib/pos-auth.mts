// POS sign-in. Two signed, HttpOnly cookies:
//  - kf_dev: this tablet or phone was paired with the owner's STAFF_PIN.
//    Nothing in the POS answers a device without it.
//  - kf_ses: who is signed in (staff id, role), checked against the staff
//    list on every write. Personal 4-digit PINs are checked here, never in
//    the browser, and five wrong tries lock that person out for 5 minutes.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PosError, posStore, readStaffRaw, type Role } from "./pos-data.mts";

const DEVICE_DAYS = 400;
const SESSION_HOURS = 16;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

export interface Session {
  sid: string;
  role: Role;
  name: string;
  exp: number;
}

function secret(): string {
  const own = Netlify.env.get("POS_SECRET");
  if (own) return own;
  const pin = Netlify.env.get("STAFF_PIN");
  if (!pin) throw new PosError(503, "not_configured");
  // Changing STAFF_PIN signs every device and person out.
  return createHash("sha256").update("kings-food-pos|" + pin).digest("hex");
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();

function sign(payload: object): string {
  const body = b64(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(unb64(body));
    return p && typeof p === "object" && Number(p.exp) > Date.now() ? (p as T) : null;
  } catch {
    return null;
  }
}

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name: string, value: string, maxAgeSec: number, secure: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}
const isSecure = (req: Request) => new URL(req.url).protocol === "https:";

export function deviceOk(req: Request): boolean {
  return !!verify<{ d: number; exp: number }>(cookies(req).kf_dev);
}

export function pairCookie(req: Request): string {
  return cookie("kf_dev", sign({ d: 1, exp: Date.now() + DEVICE_DAYS * 86_400_000 }), DEVICE_DAYS * 86_400, isSecure(req));
}

export function clearCookies(req: Request): string[] {
  return [cookie("kf_dev", "", 0, isSecure(req)), cookie("kf_ses", "", 0, isSecure(req))];
}

export function session(req: Request): Session | null {
  return verify<Session>(cookies(req).kf_ses);
}

export function sessionCookie(req: Request, s: Omit<Session, "exp">): string {
  return cookie("kf_ses", sign({ ...s, exp: Date.now() + SESSION_HOURS * 3_600_000 }), SESSION_HOURS * 3600, isSecure(req));
}

export function endSessionCookie(req: Request): string {
  return cookie("kf_ses", "", 0, isSecure(req));
}

export function ownerCodeMatches(given: unknown): boolean {
  const pin = Netlify.env.get("STAFF_PIN");
  if (!pin || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(pin);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Same scheme the POS uses when a manager sets someone's PIN.
export function pinHash(salt: string, pin: string): string {
  return createHash("sha256").update(`kingsfood:${salt}:${pin}`).digest("hex");
}

type Lock = { fails: number; until: number };

export async function checkPin(staffId: string, pin: string): Promise<{ ok: true; role: Role; name: string } | { ok: false; wait: number }> {
  const s = posStore();
  const key = `auth/${staffId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const lock = ((await s.get(key, { type: "json" })) as Lock | null) ?? { fails: 0, until: 0 };
  if (lock.until > Date.now()) return { ok: false, wait: Math.ceil((lock.until - Date.now()) / 1000) };
  const staff = await readStaffRaw();
  const m = staff[staffId];
  const good =
    !!m && m.active !== false && typeof m.salt === "string" && typeof m.pinHash === "string" && /^\d{4}$/.test(pin) &&
    timingSafeEqual(Buffer.from(pinHash(m.salt, pin)), Buffer.from(String(m.pinHash).padEnd(64, "0").slice(0, 64)));
  if (good) {
    if (lock.fails) await s.delete(key);
    return { ok: true, role: m!.role === "manager" ? "manager" : "staff", name: String(m!.name ?? "") };
  }
  const fails = lock.fails + 1;
  const next: Lock = fails >= MAX_FAILS ? { fails: 0, until: Date.now() + LOCK_MS } : { fails, until: 0 };
  await s.setJSON(key, next);
  return { ok: false, wait: next.until ? Math.ceil(LOCK_MS / 1000) : 0 };
}

// The session's person must still exist, be active and have the same role.
export async function liveSession(req: Request): Promise<Session | null> {
  const s = session(req);
  if (!s) return null;
  const m = (await readStaffRaw())[s.sid];
  if (!m || m.active === false) return null;
  const role: Role = m.role === "manager" ? "manager" : "staff";
  return { ...s, role, name: String(m.name ?? s.name) };
}
