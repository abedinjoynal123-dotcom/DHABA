// Local POS server for development and the browser tests: serves public/ and
// runs the Netlify functions with in-memory storage and a scripted fake Claude.
//   STAFF_PIN=123456 node --experimental-strip-types --experimental-test-module-mocks --no-warnings scripts/pos-dev-server.mjs [port]
// Test hooks (local only): POST /__test/claude [responses...] queues fake
// Claude replies; GET /__test/claude returns the requests Claude received.
import { mock } from "node:test";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { blobsModule } from "./blobs-memory.mjs";

mock.module("@netlify/blobs", { namedExports: blobsModule });
globalThis.Netlify = { env: { get: (k) => process.env[k] } };

const queue = [];
const log = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://api.anthropic.com/")) {
    const req = JSON.parse(init.body);
    log.push(req);
    await new Promise((r) => setTimeout(r, 150));
    const next = queue.shift() ?? { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" };
    if (next.status) return new Response(JSON.stringify({ error: { type: "x" } }), { status: next.status });
    return new Response(JSON.stringify({ content: next.content, stop_reason: next.stop_reason ?? "end_turn" }), { status: 200 });
  }
  return realFetch(url, init);
};

const fn = async (f) => (await import(f)).default;
const routes = [
  ["/api/pos-ai", await fn("../netlify/functions/pos-ai.mts"), true],
  ["/api/pos/", await fn("../netlify/functions/pos.mts")],
  ["/api/checkout", await fn("../netlify/functions/checkout.mts")],
  ["/api/orders", await fn("../netlify/functions/orders.mts")],
];
const root = fileURLToPath(new URL("../public/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  if (url.pathname === "/__test/claude") {
    if (req.method === "POST") { queue.push(...JSON.parse(body.toString() || "[]")); res.end("{}"); }
    else res.end(JSON.stringify(log));
    return;
  }
  for (const [prefix, handler, background] of routes) {
    if (url.pathname === prefix || url.pathname.startsWith(prefix)) {
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      if (background) { handler(request).catch((e) => console.error(e)); res.writeHead(202).end(); return; }
      const out = await handler(request, {});
      const headers = {};
      out.headers.forEach((v, k) => { if (k !== "set-cookie") headers[k] = v; });
      const cookies = out.headers.getSetCookie ? out.headers.getSetCookie() : [];
      if (cookies.length) headers["set-cookie"] = cookies;
      res.writeHead(out.status, headers);
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  try {
    const data = await readFile(join(root, p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
});
const port = Number(process.argv[2] || 8888);
server.listen(port, "127.0.0.1", () => console.log(`POS dev server on http://localhost:${port}`));
