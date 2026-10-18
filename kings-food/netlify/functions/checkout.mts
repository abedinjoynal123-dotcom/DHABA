// POST /api/checkout - an order from the website's order form.
//
// Body: { customer: { name, phone }, service: "takeaway" | "eat_in",
//         lines: [{ item_id, variant_id, quantity, side, note }], note, lang }
// Prices come from menu.json on the server; the browser's totals are ignored.
import type { Config } from "@netlify/functions";
import { OrderError, orderingClosedReason, priceOrder, type Lang, type OrderLineInput } from "../lib/catalog.mts";
import { cleanPhone } from "../lib/assistant.mts";
import { createOrder } from "../lib/orders-store.mts";

const MAX_BODY_BYTES = 20_000;

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export default async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

  let body: {
    customer?: { name?: unknown; phone?: unknown };
    service?: unknown;
    lines?: unknown;
    note?: unknown;
    lang?: unknown;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "bad_request" });
  }

  const lang: Lang = body.lang === "en" ? "en" : "et";
  const name = typeof body.customer?.name === "string" ? body.customer.name.trim().slice(0, 80) : "";
  if (!name) return json(400, { error: "name_required" });
  const phone = cleanPhone(typeof body.customer?.phone === "string" ? body.customer.phone : "");
  if (!phone) return json(400, { error: "phone_invalid" });
  const service = body.service === "eat_in" ? "eat_in" : body.service === "takeaway" ? "takeaway" : null;
  if (!service) return json(400, { error: "service_required" });

  const closed = orderingClosedReason();
  if (closed) return json(409, { error: "closed", message: closed });

  let priced;
  try {
    const lines = Array.isArray(body.lines) ? (body.lines as OrderLineInput[]) : [];
    priced = priceOrder(
      lines.map((l) => ({
        item_id: String(l?.item_id ?? ""),
        variant_id: String(l?.variant_id ?? ""),
        quantity: Number(l?.quantity),
        side: typeof l?.side === "string" ? l.side : null,
        note: typeof l?.note === "string" ? l.note : null,
      })),
      lang,
    );
  } catch (err) {
    if (err instanceof OrderError) return json(400, { error: "invalid_order", message: err.message });
    throw err;
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;

  try {
    const order = await createOrder({
      channel: "web",
      lang,
      customer: { name, phone },
      service,
      lines: priced.lines,
      total: priced.total,
      note,
    });
    return json(200, {
      order: {
        number: order.number,
        total: order.total,
        service: order.service,
        lines: order.lines.map((l) => ({
          quantity: l.quantity,
          name: l.name,
          variant: l.variantName,
          side: l.sideName,
          lineTotal: l.lineTotal,
        })),
      },
    });
  } catch (err) {
    console.error("Checkout failed", err);
    return json(500, { error: "failed" });
  }
};

export const config: Config = {
  path: "/api/checkout",
  method: "POST",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
