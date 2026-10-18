// Orders are kept in Netlify Blobs, one JSON object per order, under
// "<YYYY-MM-DD>/<order number>". Each order is written once by the chat and
// later updated only by staff changing its status.
import { getStore } from "@netlify/blobs";
import type { Lang, PricedLine } from "./catalog.mts";
import { tallinnDate } from "./catalog.mts";

// Customer names and phone numbers stay in the EU.
const STORE = { name: "orders", region: "eu-central-1", consistency: "strong" } as const;

export const STATUSES = ["new", "preparing", "ready", "completed", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export interface Order {
  number: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  status: Status;
  channel: "web";
  lang: Lang;
  customer: { name: string; phone: string };
  service: "takeaway" | "eat_in";
  lines: PricedLine[];
  total: number;
  note: string | null;
}

export type NewOrder = Omit<Order, "number" | "date" | "createdAt" | "updatedAt" | "status">;

function store() {
  return getStore(STORE);
}

// Short numbers are easy to say at the counter. onlyIfNew makes the write
// fail instead of overwriting when two orders draw the same number.
export async function createOrder(input: NewOrder, now = new Date()): Promise<Order> {
  const date = tallinnDate(now);
  for (let attempt = 0; attempt < 20; attempt++) {
    const number = String(100 + Math.floor(Math.random() * 900));
    const order: Order = {
      ...input,
      number,
      date,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: "new",
    };
    const { modified } = await store().setJSON(`${date}/${number}`, order, { onlyIfNew: true });
    if (modified) return order;
  }
  throw new Error("Could not allocate an order number.");
}

export async function listOrders(date: string): Promise<Order[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: `${date}/` });
  const orders = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" }) as Promise<Order | null>));
  return orders
    .filter((o): o is Order => o !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateStatus(date: string, number: string, status: Status): Promise<Order | null> {
  const s = store();
  const key = `${date}/${number}`;
  const current = (await s.get(key, { type: "json" })) as Order | null;
  if (!current) return null;
  const updated: Order = { ...current, status, updatedAt: new Date().toISOString() };
  await s.setJSON(key, updated);
  return updated;
}
