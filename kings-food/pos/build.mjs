// Builds the POS app (public/staff/index.html) from pos/src.
//   node pos/build.mjs
// The same app runs as a Claude artifact; here pos/src/runtime.js connects it
// to this site's server (/api/pos/*) instead.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(root, "src", f), "utf8");

const app = src("app.js")
  .replace("/*INV_MODULE*/", src("inv.js"))
  .replace("/*AI_MODULE*/", src("ai.js") + "\n" + src("ia.js"));
for (const marker of ["/*INV_MODULE*/", "/*AI_MODULE*/"]) if (app.includes(marker)) throw new Error("Unreplaced " + marker);

let shell = src("shell.html").replace('url("data:image/webp;base64,LOGO_B64")', 'url("/assets/img/logo-256.webp")');
if (shell.includes("LOGO_B64")) throw new Error("Logo placeholder left in shell.html");
const scripts = [src("i18n.js"), src("runtime.js"), app].join("\n;\n");
if (!shell.includes("SCRIPT_HERE")) throw new Error("SCRIPT_HERE missing");
shell = shell.replace("SCRIPT_HERE", () => scripts);

const html = `<!doctype html>
<html lang="et">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0C0C0E">
<link rel="icon" href="/assets/img/favicon-64.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<style>html,body{margin:0}body{background:#F4F3EF}
.pairsheet{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:radial-gradient(ellipse at 50% 35%,#2a1a0c,#070708 75%);color:#F2EEE4;font-family:Manrope,system-ui,sans-serif}
.pairbox{width:min(380px,100%);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.pairbox .logo{width:96px;height:96px;margin-bottom:6px}
.pairbox h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:2rem;margin:0}
.pairbox .sub{margin:0 0 8px;color:rgba(242,238,228,.7);line-height:1.5}
.pairbox label{width:100%;display:flex;flex-direction:column;gap:6px;text-align:left;font-weight:700;font-size:.85rem}
.pairbox input{font:inherit;font-size:1.3rem;letter-spacing:.2em;text-align:center;padding:12px;border-radius:12px;border:1px solid rgba(205,166,88,.45);background:rgba(255,255,255,.06);color:#fff}
.pairbox .perr{min-height:1.2em;margin:0;color:#F07A72;font-weight:700}
.pairbox .place{width:100%}</style>
</head>
<body>
${shell}
</body>
</html>
`;
const out = join(root, "..", "public", "staff", "index.html");
if (process.argv.includes("--check")) {
  // Used by npm test: fails when someone edited pos/src without rebuilding.
  const same = readFileSync(out, "utf8") === html;
  if (!same) console.error("public/staff/index.html is out of date: run npm run build:pos");
  process.exit(same ? 0 : 1);
}
writeFileSync(out, html);
console.log(`Built public/staff/index.html (${Math.round(html.length / 1024)} KB)`);
