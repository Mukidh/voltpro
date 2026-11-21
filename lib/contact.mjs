const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+]?[\d\s()/.-]{8,20}$/;
const recentByIp = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function clientIp(headers, fallback) {
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return fallback || "unknown";
}

function tooMany(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const stamps = (recentByIp.get(ip) || []).filter((t) => now - t < windowMs);
  if (stamps.length >= 5) {
    recentByIp.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  recentByIp.set(ip, stamps);
  return false;
}

function recipients() {
  const raw = process.env.CONTACT_TO || "nyitdom@gmail.com,kissnbussiness@gmail.com";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function handleContactRequest({ method, body, headers = {}, ip }) {
  if (method === "OPTIONS") {
    return { status: 204, headers: {}, body: "" };
  }

  if (method !== "POST") {
    return json(405, { error: "Csak POST kérés engedélyezett." });
  }

  let payload;
  try {
    payload = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return json(400, { error: "Érvénytelen kérés." });
  }

  if (clean(payload.website)) {
    return json(200, { ok: true, message: "Köszönjük. Az üzenet elment, hamarosan jelentkezünk." });
  }

  const name = clean(payload.name);
  const email = clean(payload.email);
  const phone = clean(payload.phone);
  const subject = clean(payload.subject);
  const message = clean(payload.message);
  const formStarted = Number(payload.formStarted);

  if (name.length < 2 || name.length > 80) {
    return json(400, { error: "Adja meg a teljes nevét." });
  }
  if (!EMAIL_RE.test(email)) {
    return json(400, { error: "Érvényes e-mail címet adjon meg." });
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!PHONE_RE.test(phone) || digits.length < 8 || digits.length > 15) {
      return json(400, { error: "Adjon meg érvényes telefonszámot, vagy hagyja üresen." });
    }
  }
  if (subject.length < 2 || subject.length > 120) {
    return json(400, { error: "Válasszon tárgyat." });
  }
  if (message.length < 15 || message.length > 2000) {
    return json(400, { error: "Az üzenet legyen legalább 15 karakter." });
  }

  const elapsed = Date.now() - formStarted;
  if (!Number.isFinite(formStarted) || elapsed < 1500 || elapsed > 1000 * 60 * 60 * 24) {
    return json(400, { error: "Az űrlap érvényessége lejárt. Töltse újra az oldalt, és próbálja meg újra." });
  }

  const ipAddress = clientIp(headers, ip);
  if (tooMany(ipAddress)) {
    return json(429, { error: "Túl sok üzenet erről a címről. Próbálja később, vagy hívjon minket." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return json(503, {
      error:
        "Az e-mail küldés még nincs beállítva. Hívjon minket: +36 70 567 0878 vagy +36 30 579 9361.",
      code: "RESEND_NOT_CONFIGURED",
    });
  }

  const to = recipients();
  const from = process.env.CONTACT_FROM || "VoltPro <beth.t@example.com>";
  const html = `
    <h2>Új ajánlatkérés a VoltPro oldaláról</h2>
    <p><strong>Név:</strong> ${escapeHtml(name)}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
    <p><strong>Telefon:</strong> ${escapeHtml(phone || "—")}</p>
    <p><strong>Tárgy:</strong> ${escapeHtml(subject)}</p>
    <p><strong>Üzenet:</strong></p>
    <p>${escapeHtml(message).replaceAll("\n", "<br />")}</p>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: email,
      subject: `VoltPro ajánlatkérés: ${subject}`,
      html,
      text: `Név: ${name}\nE-mail: ${email}\nTelefon: ${phone || "—"}\nTárgy: ${subject}\n\n${message}`,
    }),
  });

  if (!resendResponse.ok) {
    let detail = "";
    try {
      const errBody = await resendResponse.json();
      detail = errBody?.message || "";
    } catch {
      detail = "";
    }
    console.error("Resend error", resendResponse.status, detail);
    return json(502, {
      error: "Az üzenetet nem sikerült elküldeni. Hívjon minket: +36 70 567 0878.",
    });
  }

  return json(200, {
    ok: true,
    message: "Köszönjük. Az üzenet elment, hamarosan jelentkezünk.",
  });
}
