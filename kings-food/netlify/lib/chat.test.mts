// End-to-end test of /api/chat with the Claude API and order storage simulated.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const saved: Record<string, unknown> = {};
mock.module("@netlify/blobs", {
  namedExports: {
    getStore: () => ({
      setJSON: async (key: string, value: unknown, opts?: { onlyIfNew?: boolean }) => {
        if (opts?.onlyIfNew && key in saved) return { modified: false };
        saved[key] = value;
        return { modified: true, etag: "x" };
      },
      get: async (key: string) => saved[key] ?? null,
      list: async ({ prefix }: { prefix: string }) => ({ blobs: Object.keys(saved).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    }),
  },
});

(globalThis as any).Netlify = { env: { get: (k: string) => ({ ANTHROPIC_API_KEY: "test-key" } as Record<string, string>)[k] } };

const requests: any[] = [];
const scripted: any[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  if (String(url).startsWith("https://api.anthropic.com/")) {
    requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    const next = scripted.shift();
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(url, init);
}) as typeof fetch;

const message = (content: any[], stop_reason: string) => ({
  body: { id: "msg_" + Math.random(), type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } },
});

const { default: chat } = await import("../functions/chat.mts");

const post = (body: unknown) => chat(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));

const items = [
  { item_id: "kebab-box", variant_id: "large", quantity: 2, side: "rice", note: null },
  { item_id: "soft-drinks", variant_id: "sprite", quantity: 1, side: null, note: null },
];

test("prices, places and returns an order", async () => {
  scripted.push(
    message([{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "t1", name: "price_order", input: { items } }], "tool_use"),
    message([{ type: "tool_use", id: "t2", name: "place_order", input: { customer_name: "Mari", phone: "+372 5123 4567", service: "takeaway", items, note: null } }], "tool_use"),
    message([{ type: "text", text: "Aitäh! Teie tellimuse number on olemas." }], "end_turn"),
  );
  const res = await post({ history: [], text: "Jah, kinnitan", lang: "et", channel: "voice" });
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.reply, "Aitäh! Teie tellimuse number on olemas.");
  assert.equal(data.order.total, 2 * 900 + 250);
  assert.match(data.order.number, /^\d{3}$/);

  // Request shape sent to Claude
  const first = requests[0];
  assert.equal(first.body.model, "claude-opus-5-5");
  assert.equal(first.body.fallbacks, "default");
  assert.equal(first.body.output_config.effort, "low");
  assert.match(first.headers.get("anthropic-beta") ?? "", /server-side-fallback-2026-07-01/);
  assert.equal(first.url, "https://api.anthropic.com/v1/messages?beta=true");
  assert.equal(first.body.tools.length, 2);

  // price_order result was fed back with the exact total
  const priceResult = requests[1].body.messages.at(-1).content[0];
  assert.equal(priceResult.type, "tool_result");
  assert.match(priceResult.content, /20,50/);

  // Thinking block kept unchanged in history
  assert.deepEqual(data.history[1].content[0], { type: "thinking", thinking: "", signature: "sig" });

  // Order stored with server-side prices
  const stored = Object.values(saved)[0] as any;
  assert.equal(stored.total, 2050);
  assert.equal(stored.status, "new");
  assert.equal(stored.channel, "voice");
  assert.equal(stored.customer.phone, "+372 5123 4567");
});

test("tool errors go back to the model instead of failing", async () => {
  scripted.push(
    message([{ type: "tool_use", id: "t3", name: "price_order", input: { items: [{ item_id: "kebab-box", variant_id: "small", quantity: 1, side: null, note: null }] } }], "tool_use"),
    message([{ type: "text", text: "Fries or rice?" }], "end_turn"),
  );
  const before = requests.length;
  const res = await post({ history: [], text: "Kebab box small", lang: "en" });
  const data = await res.json();
  assert.equal(data.reply, "Fries or rice?");
  const toolResult = requests[before + 1].body.messages.at(-1).content[0];
  assert.equal(toolResult.is_error, true);
  assert.match(toolResult.content, /fries or rice/);
  assert.equal(data.order, null);
});

test("invalid phone numbers are rejected before saving", async () => {
  const count = Object.keys(saved).length;
  scripted.push(
    message([{ type: "tool_use", id: "t4", name: "place_order", input: { customer_name: "Jaan", phone: "call me", service: "eat_in", items, note: null } }], "tool_use"),
    message([{ type: "text", text: "Could you repeat your phone number?" }], "end_turn"),
  );
  const data = await (await post({ history: [], text: "Yes", lang: "en" })).json();
  assert.equal(data.order, null);
  assert.equal(Object.keys(saved).length, count);
});

test("refusals reset the conversation", async () => {
  scripted.push(message([], "refusal"));
  const data = await (await post({ history: [], text: "something", lang: "en" })).json();
  assert.equal(data.notice, "refused");
  assert.deepEqual(data.history, []);
});

test("a rejected conversation asks the browser to start over", async () => {
  scripted.push({ status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "bad history" } } });
  const res = await post({ history: [], text: "hi", lang: "en" });
  assert.equal(res.status, 409);
});

test("validates input", async () => {
  assert.equal((await post({ history: [], text: "" })).status, 400);
  assert.equal((await post({ history: [], text: "x".repeat(1001) })).status, 400);
  assert.equal((await chat(new Request("http://localhost/api/chat", { method: "GET" }))).status, 405);
});
