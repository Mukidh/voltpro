import { handleContactRequest } from "../lib/contact.mjs";

function corsHeaders(origin) {
  const allowed = (process.env.CONTACT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const headers = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!origin) return headers;
  if (!allowed.length || allowed.includes(origin) || allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const extra = corsHeaders(origin);
  Object.entries(extra).forEach(([key, value]) => res.setHeader(key, value));

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  const result = await handleContactRequest({
    method: req.method,
    body: raw,
    headers: req.headers,
    ip: req.socket?.remoteAddress,
  });

  Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
  res.statusCode = result.status;
  res.end(result.body || "");
}
