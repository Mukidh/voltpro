import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { corsHeaders, handleContactRequest } from "./lib/contact.mjs";
import { loadEnv } from "./lib/load-env.mjs";
import { readLimitedBody } from "./lib/read-body.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const rootPrefix = resolve(root) + sep;
loadEnv(root);

const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
const BLOCKED_NAMES = new Set([
  "server.mjs",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".env",
  ".env.example",
  ".gitignore",
]);
const BLOCKED_DIRS = new Set(["lib", "api", "node_modules", ".git", ".vercel", ".vscode"]);
const STATIC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
    "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' https://images.unsplash.com data:; connect-src 'self'",
};

function safeFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes("\0")) return null;

  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const parts = relative.split(/[/\\]/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((part) => part === ".." || part.startsWith("."))) return null;
  if (BLOCKED_DIRS.has(parts[0]) || BLOCKED_NAMES.has(parts[0])) return null;

  const full = resolve(root, ...parts);
  if (full !== resolve(root) && !full.startsWith(rootPrefix)) return null;

  const ext = extname(full).toLowerCase();
  if (!TYPES[ext]) return null;
  return full;
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = createServer(async (req, res) => {
  const host = String(req.headers.host || "127.0.0.1:4173");
  const url = new URL(req.url || "/", `http://${host}`);

  if (url.pathname === "/api/contact") {
    const extra = corsHeaders(req.headers.origin || "");
    Object.entries(extra).forEach(([key, value]) => res.setHeader(key, value));

    let raw = "";
    try {
      raw = await readLimitedBody(req);
    } catch (error) {
      if (error?.code === "PAYLOAD_TOO_LARGE") {
        send(res, 413, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: "A kérés túl nagy." }));
        req.destroy();
        return;
      }
      send(res, 400, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify({ error: "Érvénytelen kérés." }));
      return;
    }

    const result = await handleContactRequest({
      method: req.method,
      body: raw,
      headers: req.headers,
      ip: req.socket.remoteAddress,
    });
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.statusCode = result.status;
    res.end(result.body || "");
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed");
    return;
  }

  let file = safeFile(url.pathname);
  if (!file) {
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8", ...STATIC_HEADERS }, "Not found");
    return;
  }

  if (existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, "index.html");
    if (!TYPES[extname(file).toLowerCase()] || file.split(sep).some((part) => BLOCKED_DIRS.has(part))) {
      send(res, 404, { "Content-Type": "text/plain; charset=utf-8", ...STATIC_HEADERS }, "Not found");
      return;
    }
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8", ...STATIC_HEADERS }, "Not found");
    return;
  }

  const type = TYPES[extname(file).toLowerCase()];
  const body = req.method === "HEAD" ? undefined : readFileSync(file);
  send(res, 200, { "Content-Type": type, ...STATIC_HEADERS }, body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`VoltPro local server: http://127.0.0.1:${PORT}`);
  if (!process.env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY is not set — the form will return a configuration error until you add it.");
  }
});
