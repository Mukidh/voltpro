const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE_RE = /^[+]?[\d\s()/.-]{8,20}$/;
const ALLOWED_SUBJECTS = new Set([
  "Lakossági villanyszerelés",
  "Irodai / üzleti rendszer",
  "Okosotthon",
  "Ipari kivitelezés",
  "EV töltő",
  "Hibakeresés / karbantartás",
  "Egyéb",
]);
const DEFAULT_ORIGINS = [
  "https://mukidh.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
];
const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
};

const recentByIp = new Map();
const coarseByIp = new Map();
let pruneCounter = 0;

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function headerSafe(value) {
  return clean(value).replace(/[\r\n]+/g, " ").slice(0, 200);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function isEmail(value) {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value) && !/[\s<>]/.test(value);
}

function allowedOrigins() {
  const extra = (process.env.CONTACT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== "*");
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

export function corsHeaders(origin) {
  const headers = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    ...SECURITY_HEADERS,
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function normalizeIp(ip) {
  let value = String(ip || "unknown").trim();
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value || "unknown";
}

function clientIp(headers, fallback) {
  const trustProxy = process.env.VERCEL === "1" || process.env.CONTACT_TRUST_PROXY === "1";
  if (trustProxy) {
    const platform = headers["x-vercel-forwarded-for"] || headers["x-real-ip"];
    if (typeof platform === "string" && platform.trim()) {
      return normalizeIp(platform.split(",")[0]);
    }
    const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return normalizeIp(forwarded.split(",")[0]);
    }
  }
  return normalizeIp(fallback);
}

function hitLimit(store, ip, max, windowMs) {
  const now = Date.now();
  pruneCounter += 1;
  if (pruneCounter % 200 === 0) {
    for (const [key, stamps] of store) {
      const next = stamps.filter((t) => now - t < windowMs);
      if (next.length) store.set(key, next);
      else store.delete(key);
    }
    if (store.size > 8000) {
      const first = store.keys().next().value;
      if (first) store.delete(first);
    }
  }

  const stamps = (store.get(ip) || []).filter((t) => now - t < windowMs);
  if (stamps.length >= max) {
    store.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  store.set(ip, stamps);
  return false;
}

function recipients() {
  const raw = process.env.CONTACT_TO || "nyitdom@gmail.com";
  return [...new Set(raw.split(",").map((item) => clean(item).toLowerCase()).filter(isEmail))];
}

function contentTypeIsJson(headers) {
  const value = String(headers["content-type"] || headers["Content-Type"] || "").toLowerCase();
  return value.startsWith("application/json");
}

export async function handleContactRequest({ method, body, headers = {}, ip }) {
  if (method === "OPTIONS") {
    return { status: 204, headers: corsHeaders(headers.origin || headers.Origin || ""), body: "" };
  }

  if (method !== "POST") {
    return json(405, { error: "Csak POST kérés engedélyezett." }, { Allow: "POST, OPTIONS" });
  }

  const origin = headers.origin || headers.Origin || "";
  if (origin && !allowedOrigins().has(origin)) {
    return json(403, { error: "A kérés originje nem engedélyezett." });
  }

  if (typeof body === "string" && body.length && !contentTypeIsJson(headers)) {
    return json(415, { error: "Érvénytelen kérés." });
  }

  const ipAddress = clientIp(headers, ip);
  if (hitLimit(coarseByIp, ipAddress, 20, 10 * 60 * 1000)) {
    return json(429, { error: "Túl sok kérés. Próbálja később, vagy hívjon minket." });
  }

  let payload;
  try {
    payload = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return json(400, { error: "Érvénytelen kérés." });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { error: "Érvénytelen kérés." });
  }

  if (clean(payload.website)) {
    return json(200, { ok: true, message: "Köszönjük. Az üzenet elment, hamarosan jelentkezünk." });
  }

  const name = clean(payload.name).slice(0, 80);
  const email = clean(payload.email);
  const phone = clean(payload.phone);
  const subject = clean(payload.subject);
  const message = clean(payload.message).slice(0, 2000);
  const formStarted = Number(payload.formStarted);

  if (name.length < 2) {
    return json(400, { error: "Adja meg a teljes nevét." });
  }
  if (!isEmail(email)) {
    return json(400, { error: "Érvényes e-mail címet adjon meg." });
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!PHONE_RE.test(phone) || digits.length < 8 || digits.length > 15) {
      return json(400, { error: "Adjon meg érvényes telefonszámot, vagy hagyja üresen." });
    }
  }
  if (!ALLOWED_SUBJECTS.has(subject)) {
    return json(400, { error: "Válasszon tárgyat." });
  }
  if (message.length < 15) {
    return json(400, { error: "Az üzenet legyen legalább 15 karakter." });
  }

  const elapsed = Date.now() - formStarted;
  if (!Number.isFinite(formStarted) || elapsed < 1500 || elapsed > 1000 * 60 * 60 * 24) {
    return json(400, { error: "Az űrlap érvényessége lejárt. Töltse újra az oldalt, és próbálja meg újra." });
  }

  if (hitLimit(recentByIp, ipAddress, 5, 60 * 60 * 1000)) {
    return json(429, { error: "Túl sok üzenet erről a címről. Próbálja később, vagy hívjon minket." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || typeof apiKey !== "string" || apiKey.length < 20) {
    return json(503, {
      error: "Az e-mail küldés még nincs beállítva. Hívjon minket: +36 70 567 0878 vagy +36 30 579 9361.",
    });
  }

  const to = recipients();
  if (!to.length) {
    return json(503, {
      error: "Az e-mail küldés még nincs beállítva. Hívjon minket: +36 70 567 0878.",
    });
  }

  const from = headerSafe(process.env.CONTACT_FROM || "VoltPro <onboarding@resend.dev>");
  const html = `
    <h2>Új ajánlatkérés a VoltPro oldaláról</h2>
    <p><strong>Név:</strong> ${escapeHtml(name)}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
    <p><strong>Telefon:</strong> ${escapeHtml(phone || "—")}</p>
    <p><strong>Tárgy:</strong> ${escapeHtml(subject)}</p>
    <p><strong>Üzenet:</strong></p>
    <p>${escapeHtml(message).replaceAll("\n", "<br />")}</p>
  `;
  const text = `Név: ${name}\nE-mail: ${email}\nTelefon: ${phone || "—"}\nTárgy: ${subject}\n\n${message}`;

  let delivered = 0;
  for (const recipient of to) {
    let resendResponse;
    try {
      resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          reply_to: email,
          subject: headerSafe(`VoltPro ajánlatkérés: ${subject}`),
          html,
          text,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      console.error("Resend request failed", recipient, error?.name || "error");
      continue;
    }

    if (resendResponse.ok) {
      delivered += 1;
      continue;
    }

    let detail = "";
    try {
      const errBody = await resendResponse.json();
      detail = errBody?.name || String(resendResponse.status);
    } catch {
      detail = String(resendResponse.status);
    }
    console.error("Resend error", recipient, resendResponse.status, detail);
  }

  if (!delivered) {
    return json(502, {
      error: "Az üzenetet nem sikerült elküldeni. Hívjon minket: +36 70 567 0878.",
    });
  }

  return json(200, {
    ok: true,
    message: "Köszönjük. Az üzenet elment, hamarosan jelentkezünk.",
  });
}
