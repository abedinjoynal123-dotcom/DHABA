// The King's Food ordering assistant: system prompt, tools and tool handlers.
import type Anthropic from "@anthropic-ai/sdk";
import {
  MENU,
  SITE,
  OrderError,
  availableItems,
  formatEuro,
  orderingClosedReason,
  priceOrder,
  type Lang,
  type OrderLineInput,
  type PricedOrder,
} from "./catalog.mts";
import { createOrder, type Order } from "./orders-store.mts";

export const MODEL = "claude-opus-5-5";

function menuForPrompt(): string {
  const lines: string[] = [];
  for (const cat of MENU.categories) {
    const items = availableItems().filter((i) => i.category === cat.id);
    if (!items.length) continue;
    lines.push(`\n## ${cat.name.en} / ${cat.name.et}`);
    for (const item of items) {
      lines.push(`- item_id "${item.id}": ${item.name.en} (Estonian: ${item.name.et})`);
      if (item.description) lines.push(`  Contents: ${item.description.en} (ET: ${item.description.et})`);
      for (const v of item.variants) {
        const label = v.name ? `${v.name.en} / ${v.name.et}` : "standard";
        const desc = v.description ? ` - ${v.description.en} (ET: ${v.description.et})` : "";
        lines.push(`  variant_id "${v.id}": ${label}, ${formatEuro(v.price)}${desc}`);
      }
      if (item.options?.includes("side")) lines.push(`  Requires side: "fries" (frii) or "rice" (riis), same price.`);
    }
  }
  return lines.join("\n");
}

function hoursForPrompt(): string {
  const entries = Object.entries(SITE.hours ?? {});
  if (!entries.length) return "Opening hours have not been announced yet. Do not guess them.";
  return entries.map(([d, h]) => `${d}: ${h === "closed" ? "closed" : `${h[0]}-${h[1]}`}`).join(", ");
}

// Built once per deploy and never changes between requests, so it caches.
export const SYSTEM_PROMPT = `You are the ordering assistant for ${SITE.name}, a premium fast food restaurant at ${SITE.address.street}, ${SITE.address.district}, ${SITE.address.city}, Estonia. Customers reach you through the chat on the restaurant's website, by typing or by speaking. Spoken messages arrive as speech-to-text transcripts and your replies may be read aloud.

Your jobs: take takeaway and eat-in orders, and answer questions about the menu, prices, location and the restaurant.

# Restaurant facts
- Address: ${SITE.address.street}, ${SITE.address.district}, ${SITE.address.city}
- Phone: ${SITE.phone}
- Service: eat in or takeaway. There is no delivery through this chat.
- Opening hours: ${hoursForPrompt()}
- Payment: ${SITE.ordering.payment.en} Online payment is not available.
- Prices are in euros and include VAT.

# Menu (the only items that exist)
${menuForPrompt()}

# How to take an order
1. Find out what the customer wants. For Kebab Box, ask small or large. For Kebab Box, Crispy Chicken Box and Fish & Chips, ask fries or rice. For Burgers, ask burger or kebab burger. For the ice cream shake, ask plum or mango. For soft drinks, ask Coca-Cola, Fanta or Sprite.
2. Ask whether it is takeaway or eat in, and ask for the customer's name and phone number.
3. Call price_order with the full order. Never calculate totals yourself; always use the total price_order returns.
4. Read the order back with the total and ask the customer to confirm.
5. Only after the customer clearly confirms, call place_order once. Then give them the order number and tell them to show it at the counter, and remind them that ${SITE.ordering.payment.en.toLowerCase()}
If the customer changes the order after it was placed, explain that you will place a new order and ask them to tell the staff at the counter to cancel the earlier number, or to call ${SITE.phone}.

# Rules
- Reply in the customer's language. Estonian and English are the main languages; you may also answer in Russian or another language if the customer writes in it.
- Keep replies short and conversational: one to three sentences, plain text, no markdown, no bullet symbols, no emoji. Write prices like 7,90 € in Estonian and €7.90 in English.
- Never invent items, sizes, extras, prices, discounts, allergens, ingredients beyond the listed contents, waiting times, opening hours or delivery. If you do not know something, say so and suggest calling ${SITE.phone}.
- Allergy questions: give the listed contents only and tell the customer to confirm with staff by calling ${SITE.phone}, because you cannot guarantee allergen information.
- If a tool returns an error, explain the problem to the customer in plain words and fix the order with them.
- Stay on the topic of King's Food. Politely decline unrelated requests.`;

const lineSchema = {
  type: "object",
  properties: {
    item_id: { type: "string", enum: availableItems().map((i) => i.id), description: "item_id from the menu" },
    variant_id: { type: "string", description: "variant_id from the menu for this item" },
    quantity: { type: "integer", description: "How many of this exact item, 1 to 20" },
    side: { type: ["string", "null"], description: "\"fries\" or \"rice\" for items that require a side, otherwise null" },
    note: { type: ["string", "null"], description: "Short customer request for this line, e.g. 'no onion', otherwise null" },
  },
  required: ["item_id", "variant_id", "quantity", "side", "note"],
  additionalProperties: false,
} as const;

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "price_order",
    description:
      "Validate an order against the menu and return the exact itemized price and total. Call this before reading an order back to the customer and whenever the order changes.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { items: { type: "array", items: lineSchema } },
      required: ["items"],
      additionalProperties: false,
    },
  },
  {
    name: "place_order",
    description:
      "Send a confirmed order to the kitchen. Call only once, after price_order and after the customer has explicitly confirmed the items, total, service type, name and phone number. Returns the order number.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's name" },
        phone: { type: "string", description: "Customer's phone number as they gave it" },
        service: { type: "string", enum: ["takeaway", "eat_in"] },
        items: { type: "array", items: lineSchema },
        note: { type: ["string", "null"], description: "Note for the whole order, otherwise null" },
      },
      required: ["customer_name", "phone", "service", "items", "note"],
      additionalProperties: false,
    },
  },
];

function describe(priced: PricedOrder, lang: Lang) {
  return {
    lines: priced.lines.map((l) => ({
      quantity: l.quantity,
      item: l.name,
      variant: l.variantName,
      side: l.sideName,
      note: l.note,
      line_total: formatEuro(l.lineTotal, lang),
    })),
    total: formatEuro(priced.total, lang),
  };
}

function cleanPhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!/^\+?[\d\s()-]+$/.test(trimmed) || digits.length < 7 || digits.length > 15) return null;
  return trimmed.replace(/\s+/g, " ");
}

export interface ToolContext {
  lang: Lang;
  channel: "chat" | "voice";
  placed: Order[];
}

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;

  if (name === "price_order") {
    const priced = priceOrder(args.items as OrderLineInput[], ctx.lang);
    return JSON.stringify(describe(priced, ctx.lang));
  }

  if (name === "place_order") {
    const closed = orderingClosedReason();
    if (closed) throw new OrderError(`${closed} Orders cannot be placed right now.`);

    const customerName = String(args.customer_name ?? "").trim().slice(0, 80);
    if (!customerName) throw new OrderError("The customer's name is missing.");
    const phone = cleanPhone(String(args.phone ?? ""));
    if (!phone) throw new OrderError("The phone number does not look valid. Ask the customer to repeat it.");
    const service = args.service === "eat_in" ? "eat_in" : args.service === "takeaway" ? "takeaway" : null;
    if (!service) throw new OrderError("Service must be takeaway or eat_in.");

    const priced = priceOrder(args.items as OrderLineInput[], ctx.lang);
    const note = typeof args.note === "string" && args.note.trim() ? args.note.trim().slice(0, 300) : null;

    const order = await createOrder({
      channel: ctx.channel,
      lang: ctx.lang,
      customer: { name: customerName, phone },
      service,
      lines: priced.lines,
      total: priced.total,
      note,
    });
    ctx.placed.push(order);
    return JSON.stringify({ order_number: order.number, status: "sent to kitchen", ...describe(priced, ctx.lang) });
  }

  throw new OrderError(`Unknown tool ${name}.`);
}
