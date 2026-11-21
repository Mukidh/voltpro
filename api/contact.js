import { corsHeaders, handleContactRequest } from "../lib/contact.mjs";
import { readLimitedBody } from "../lib/read-body.mjs";

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const extra = corsHeaders(origin);
  Object.entries(extra).forEach(([key, value]) => res.setHeader(key, value));

  let raw = "";
  try {
    raw = await readLimitedBody(req);
  } catch (error) {
    if (error?.code === "PAYLOAD_TOO_LARGE") {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "A kérés túl nagy." }));
      req.destroy();
      return;
    }
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Érvénytelen kérés." }));
    return;
  }

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
