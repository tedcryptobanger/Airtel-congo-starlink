import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "POST") return new Response("OK");

  let update;
  try {
    update = await req.json();
  } catch {
    return new Response("OK");
  }

  const cb = update.callback_query;
  if (!cb || !cb.data) return new Response("OK");

  const [action, requestId] = cb.data.split(":");
  if (!requestId || !["approve", "reject"].includes(action)) return new Response("OK");

  try {
    const status = action === "approve" ? "approved" : "rejected";
    const store = getStore("status");
    await store.set(requestId, status);
  } catch (err) {
    console.error("Blobs SET error in webhook:", err);
  }

  await tg(process.env.TG_BOT_TOKEN, "answerCallbackQuery", {
    callback_query_id: cb.id,
    text: action === "approve" ? "✅ Demande approuvée" : "❌ Demande rejetée",
    show_alert: false,
  });

  const original = cb.message?.text || "";
  const edited = `${original}\n\n<b>➡️ Décision :</b> ${
    action === "approve" ? "✅ <b>APPROUVÉ</b>" : "❌ <b>REJETÉ</b>"
  }`;

  await tg(process.env.TG_BOT_TOKEN, "editMessageText", {
    chat_id: cb.message.chat.id,
    message_id: cb.message.message_id,
    text: edited,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  });

  return new Response("OK");
};

async function tg(token, method, payload) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.error("Telegram error:", err));
}