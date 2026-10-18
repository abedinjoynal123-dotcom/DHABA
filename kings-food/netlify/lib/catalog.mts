// Menu and business details shared by the AI chat and the staff screen.
// Both files are the same ones the public website renders, so prices can
// never differ between what customers see and what they are charged.
import menuData from "../../public/assets/data/menu.json" with { type: "json" };
import siteData from "../../public/assets/data/site.json" with { type: "json" };

export type Lang = "et" | "en";
export type Text = { et: string; en: string };

export interface Variant {
  id: string;
  name?: Text;
  description?: Text;
  price: number; // euro cents
}

export interface MenuItem {
  id: string;
  category: string;
  name: Text;
  description?: Text;
  options?: string[];
  variants: Variant[];
  featured?: boolean;
  available?: boolean;
}

export interface Menu {
  version: number;
  currency: string;
  categories: { id: string; name: Text }[];
  options: Record<string, { name: Text; choices: { id: string; name: Text }[] }>;
  items: MenuItem[];
}

type DayHours = [string, string] | "closed";

export interface Site {
  name: string;
  address: { street: string; district: string; city: string; country: string };
  phone: string;
  email: string;
  hours: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>>;
  ordering: { enabled: boolean; payment: Text };
}

export const MENU = menuData as Menu;
export const SITE = siteData as unknown as Site;

export const TIME_ZONE = "Europe/Tallinn";

export function formatEuro(cents: number, lang: Lang = "en"): string {
  return new Intl.NumberFormat(lang === "et" ? "et-EE" : "en-IE", {
    style: "currency",
    currency: MENU.currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function availableItems(): MenuItem[] {
  return MENU.items.filter((i) => i.available !== false);
}

// ---------- order pricing ----------

export interface OrderLineInput {
  item_id: string;
  variant_id: string;
  quantity: number;
  side: string | null;
  note: string | null;
}

export interface PricedLine {
  itemId: string;
  variantId: string;
  name: string;
  variantName: string | null;
  side: string | null;
  sideName: string | null;
  note: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  total: number;
}

export class OrderError extends Error {}

export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_LINES = 30;

// Prices an order strictly from the menu. Anything not on the menu, a wrong
// size, a missing fries/rice choice or an odd quantity is rejected with a
// message the assistant can relay to the customer.
export function priceOrder(lines: OrderLineInput[], lang: Lang = "en"): PricedOrder {
  if (!Array.isArray(lines) || lines.length === 0) throw new OrderError("The order has no items.");
  if (lines.length > MAX_LINES) throw new OrderError(`An order can have at most ${MAX_LINES} lines.`);

  const priced = lines.map((line): PricedLine => {
    const item = availableItems().find((i) => i.id === line.item_id);
    if (!item) throw new OrderError(`"${line.item_id}" is not on the menu.`);

    const variant =
      item.variants.length === 1 && !line.variant_id
        ? item.variants[0]
        : item.variants.find((v) => v.id === line.variant_id);
    if (!variant) {
      const ids = item.variants.map((v) => v.id).join(", ");
      throw new OrderError(`${item.name.en} needs one of these variant ids: ${ids}.`);
    }

    const qty = line.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY_PER_LINE) {
      throw new OrderError(`Quantity for ${item.name.en} must be a whole number from 1 to ${MAX_QUANTITY_PER_LINE}.`);
    }

    let side: string | null = null;
    let sideName: string | null = null;
    if (item.options?.includes("side")) {
      const choice = MENU.options.side.choices.find((c) => c.id === line.side);
      if (!choice) throw new OrderError(`${item.name.en} needs a side: fries or rice.`);
      side = choice.id;
      sideName = choice.name[lang];
    }

    const note = typeof line.note === "string" && line.note.trim() ? line.note.trim().slice(0, 200) : null;

    return {
      itemId: item.id,
      variantId: variant.id,
      name: item.name[lang],
      variantName: variant.name ? variant.name[lang] : null,
      side,
      sideName,
      note,
      quantity: qty,
      unitPrice: variant.price,
      lineTotal: variant.price * qty,
    };
  });

  return { lines: priced, total: priced.reduce((sum, l) => sum + l.lineTotal, 0) };
}

// ---------- time and opening hours ----------

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function tallinnParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    day: get("weekday").slice(0, 3).toLowerCase(),
  };
}

// Business date in Tallinn, e.g. "2026-10-18".
export function tallinnDate(now = new Date()): string {
  return tallinnParts(now).date;
}

// Returns null when ordering is allowed now, otherwise the reason it is not.
// With no opening hours configured, ordering is governed by ordering.enabled only.
export function orderingClosedReason(now = new Date(), site: Site = SITE): string | null {
  if (!site.ordering.enabled) return "Online ordering is switched off at the moment.";
  const hasHours = Object.keys(site.hours ?? {}).length > 0;
  if (!hasHours) return null;

  const { day, time } = tallinnParts(now);
  if (!(DAY_KEYS as readonly string[]).includes(day)) return null;
  const today = site.hours[day as (typeof DAY_KEYS)[number]];
  if (!today || today === "closed") return "The restaurant is closed today.";
  const [open, close] = today;
  if (time < open || time >= close) return `The restaurant is open today from ${open} to ${close}.`;
  return null;
}
