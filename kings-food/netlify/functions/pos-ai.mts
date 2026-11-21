// POST /api/pos-ai - runs one Claude request for the POS AI features
// (AI Manager, inventory assistant, invoice reading). Managers only.
//
// It is a background function, so a slow answer (an invoice photo can take
// half a minute) is not cut off by the normal function time limit. The
// browser sends {job, request}, gets 202 at once, and polls
// GET /api/pos/ai/<job> until the result is stored. Tools run in the browser,
// which calls this again with the tool results (the usual tool-use loop).
import type { Config } from "@netlify/functions";
import { deviceOk, liveSession } from "../lib/pos-auth.mts";
import { posStore } from "../lib/pos-data.mts";

const MAX_BODY = 5_500_000;
const DEFAULT_MODEL = "claude-sonnet-5-5";

interface AiRequest {
  system?: unknown;
  messages?: unknown;
  tools?: unknown;
  max_tokens?: unknown;
}

function cleanRequest(r: AiRequest) {
  if (!Array.isArray(r.messages) || !r.messages.length || r.messages.length > 80) throw new Error("bad_messages");
  const tools = Array.isArray(r.tools) ? r.tools.slice(0, 20) : undefined;
  return {
    model: Netlify.env.get("AI_MODEL") || DEFAULT_MODEL,
    max_tokens: Math.min(8000, Math.max(256, Number(r.max_tokens) || 4000)),
    ...(typeof r.system === "string" && r.system ? { system: r.system.slice(0, 200_000) } : {}),
    messages: r.messages,
    ...(tools && tools.length ? { tools } : {}),
  };
}

export default async (req: Request) => {
  const store = posStore();
  let job = "";
  let sid = "";
  try {
    if (req.method !== "POST" || req.headers.get("x-kf") !== "1" || !deviceOk(req)) return;
    const live = await liveSession(req);
    if (!live || live.role !== "manager") return;
    sid = live.sid;
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new Error("too_large");
    const b = JSON.parse(raw) as { job?: unknown; request?: AiRequest };
    job = typeof b.job === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(b.job) ? b.job : "";
    if (!job) return;
    const key = Netlify.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new Error("not_configured");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(cleanRequest(b.request ?? {})),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) {
      const code = res.status === 429 || res.status === 529 ? "rate_limited" : res.status === 400 && /too long|too large/i.test(JSON.stringify(data)) ? "prompt_too_large" : "upstream_error";
      console.error("AI request failed", res.status, data?.error?.type);
      await store.setJSON(`ai/${job}`, { sid, done: true, error: code });
      return;
    }
    await store.setJSON(`ai/${job}`, {
      sid,
      done: true,
      result: { content: data.content ?? [], stop_reason: data.stop_reason ?? null },
    });
  } catch (err) {
    console.error("AI job failed", err);
    // Never throw: a thrown background function is retried by Netlify.
    if (job && sid) {
      const code = err instanceof Error && ["not_configured", "too_large", "bad_messages"].includes(err.message) ? err.message : "upstream_error";
      await store.setJSON(`ai/${job}`, { sid, done: true, error: code }).catch(() => {});
    }
  }
};

export const config: Config = {
  path: "/api/pos-ai",
  background: true,
};
