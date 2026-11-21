import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleContactRequest } from "./lib/contact.mjs";
import { loadEnv } from "./lib/load-env.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
loadEnv(root);

const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function safeFile(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = resolve(root, relative);
  if (!full.startsWith(root)) return null;
  return full;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/contact") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const result = await handleContactRequest({
      method: req.method,
      body: raw,
      headers: req.headers,
      ip: req.socket.remoteAddress,
    });
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.writeHead(result.status);
    res.end(result.body || "");
    return;
  }

  let file = safeFile(url.pathname);
  if (!file) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  if (existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, "index.html");
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(readFileSync(file));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`VoltPro local server: http://127.0.0.1:${PORT}`);
  if (!process.env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY is not set — the form will return a configuration error until you add it.");
  }
});
