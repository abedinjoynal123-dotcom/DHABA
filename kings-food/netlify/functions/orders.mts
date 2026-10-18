// /api/orders - the staff screen's view of the day's orders.
//   GET   /api/orders?date=YYYY-MM-DD      list orders (default: today in Tallinn)
//   PATCH /api/orders  {date, number, status}  change an order's status
// Every request needs the staff PIN (STAFF_PIN env var) in the x-staff-pin header.
import { timingSafeEqual } from "node:crypto";
import type { Config } from "@netlify/functions";
import { tallinnDate } from "../lib/catalog.mts";
import { STATUSES, listOrders, updateStatus, type Status } from "../lib/orders-store.mts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function pinMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req: Request) => {
  const pin = Netlify.env.get("STAFF_PIN");
  if (!pin) return json(503, { error: "not_configured" });
  if (!pinMatches(req.headers.get("x-staff-pin"), pin)) return json(401, { error: "wrong_pin" });

  if (req.method === "GET") {
    const date = new URL(req.url).searchParams.get("date") ?? tallinnDate();
    if (!DATE_RE.test(date)) return json(400, { error: "bad_date" });
    return json(200, { date, today: tallinnDate(), orders: await listOrders(date) });
  }

  if (req.method === "PATCH") {
    let body: { date?: unknown; number?: unknown; status?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "bad_request" });
    }
    const { date, number, status } = body;
    if (typeof date !== "string" || !DATE_RE.test(date)) return json(400, { error: "bad_date" });
    if (typeof number !== "string" || !/^\d{3}$/.test(number)) return json(400, { error: "bad_number" });
    if (!STATUSES.includes(status as Status)) return json(400, { error: "bad_status" });
    const order = await updateStatus(date, number, status as Status);
    return order ? json(200, { order }) : json(404, { error: "not_found" });
  }

  return json(405, { error: "method_not_allowed" });
};

export const config: Config = {
  path: "/api/orders",
  method: ["GET", "PATCH"],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
