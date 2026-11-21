// In-memory stand-in for @netlify/blobs (tests and the local POS dev server).
// Supports what the site uses: get / getWithMetadata / getMetadata / set /
// setJSON with onlyIfNew / onlyIfMatch, list({prefix}) and delete.
const stores = new Map();
let seq = 0;

export function memoryStore(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  const out = (e, type) => {
    if (!e) return null;
    if (type === "json") return JSON.parse(e.text);
    if (type === "arrayBuffer") return e.buf;
    return e.text;
  };
  const write = (key, entry, opts = {}) => {
    const cur = m.get(key);
    if (opts.onlyIfNew && cur) return { modified: false };
    if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = `"e${++seq}"`;
    m.set(key, { ...entry, etag });
    return { modified: true, etag };
  };
  return {
    async get(key, o = {}) { return out(m.get(key), o.type); },
    async getWithMetadata(key, o = {}) { const e = m.get(key); return e ? { data: out(e, o.type), etag: e.etag, metadata: e.metadata ?? {} } : null; },
    async getMetadata(key) { const e = m.get(key); return e ? { etag: e.etag, metadata: e.metadata ?? {} } : null; },
    async setJSON(key, value, opts) { return write(key, { text: JSON.stringify(value), metadata: opts?.metadata }, opts); },
    async set(key, data, opts) {
      const buf = data instanceof ArrayBuffer ? data : typeof data === "string" ? new TextEncoder().encode(data).buffer : await new Response(data).arrayBuffer();
      return write(key, { buf, text: "", metadata: opts?.metadata }, opts);
    },
    async list(o = {}) { return { blobs: [...m.entries()].filter(([k]) => k.startsWith(o.prefix ?? "")).map(([key, e]) => ({ key, etag: e.etag })), directories: [] }; },
    async delete(key) { m.delete(key); },
  };
}

export function resetMemory() { stores.clear(); }
export const blobsModule = { getStore: (o) => memoryStore(typeof o === "string" ? o : o.name) };
