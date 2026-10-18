// POST /api/chat - one customer turn with the ordering assistant.
//
// The browser keeps the conversation and sends it back each turn; this
// function appends the new message, runs the assistant (including its
// price_order / place_order tools) and returns the extended conversation.
// Orders are priced and validated here from the menu file, never from what
// the browser or the model claims.
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "@netlify/functions";
import { OrderError, type Lang } from "../lib/catalog.mts";
import { MODEL, SYSTEM_PROMPT, TOOLS, runTool, type ToolContext } from "../lib/assistant.mts";

const MAX_TEXT = 1000;
const MAX_HISTORY = 80;
const MAX_BODY_BYTES = 400_000;
const MAX_STEPS = 6;

type Message = Anthropic.Beta.BetaMessageParam;

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function replyText(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export default async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(503, { error: "not_configured" });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "conversation_too_long" });

  let body: { history?: unknown; text?: unknown; lang?: unknown; channel?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "bad_request" });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT) return json(400, { error: "bad_message" });
  const history = Array.isArray(body.history) ? (body.history as Message[]) : [];
  if (history.length > MAX_HISTORY) return json(413, { error: "conversation_too_long" });
  const lang: Lang = body.lang === "et" ? "et" : "en";
  const channel = body.channel === "voice" ? "voice" : "chat";

  const messages: Message[] = [...history, { role: "user", content: [{ type: "text", text }] }];
  const ctx: ToolContext = { lang, channel, placed: [] };
  const client = new Anthropic({ apiKey });
  let reply = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        cache_control: { type: "ephemeral" },
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      // Keep the assistant turn exactly as returned (thinking blocks included).
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") {
        return json(200, { history: [], reply: "", order: null, notice: "refused" });
      }

      if (response.stop_reason === "pause_turn") continue;

      if (response.stop_reason === "tool_use") {
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          try {
            const content = await runTool(block.name, block.input, ctx);
            results.push({ type: "tool_result", tool_use_id: block.id, content });
          } catch (err) {
            const message = err instanceof OrderError ? err.message : "The order system had a problem. Ask the customer to try again or to call the restaurant.";
            if (!(err instanceof OrderError)) console.error("Tool failed", block.name, err);
            results.push({ type: "tool_result", tool_use_id: block.id, content: message, is_error: true });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      reply = replyText(response.content);
      break;
    }
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      // Usually a conversation the API no longer accepts; the browser starts a fresh one.
      console.error("Claude rejected the conversation", err.message);
      return json(409, { error: "reset" });
    }
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
      console.error("Claude unavailable", err);
      return json(503, { error: "busy", order: ctx.placed[0] ?? null });
    }
    console.error("Chat failed", err);
    return json(500, { error: "failed", order: ctx.placed[0] ?? null });
  }

  const order = ctx.placed.at(-1) ?? null;
  return json(200, {
    history: messages,
    reply,
    order: order && {
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
};

export const config: Config = {
  path: "/api/chat",
  method: "POST",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
