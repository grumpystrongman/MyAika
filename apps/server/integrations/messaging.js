import { getProvider, setProvider } from "./store.js";

function nowIso() {
  return new Date().toISOString();
}

export async function sendSlackMessage(channel, text) {
  const stored = getProvider("slack") || {};
  const token = stored.bot_token || stored.access_token || process.env.SLACK_BOT_TOKEN || "";
  if (!token) throw new Error("slack_token_missing");
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ channel, text })
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg || "slack_post_failed");
  }
  if (stored && Object.keys(stored).length) {
    setProvider("slack", { ...stored, lastUsedAt: nowIso() });
  }
  return await r.json();
}

export async function sendTelegramMessage(chatId, text) {
  const stored = getProvider("telegram") || {};
  const token = stored.token || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) throw new Error("telegram_token_missing");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg || "telegram_send_failed");
  }
  if (stored && Object.keys(stored).length) {
    setProvider("telegram", { ...stored, lastUsedAt: nowIso() });
  }
  return await r.json();
}

export async function sendDiscordMessage(content) {
  const stored = getProvider("discord") || {};
  const webhook = stored.webhook || process.env.DISCORD_WEBHOOK_URL || "";
  if (!webhook) throw new Error("discord_webhook_missing");
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg || "discord_send_failed");
  }
  if (stored && Object.keys(stored).length) {
    setProvider("discord", { ...stored, lastUsedAt: nowIso() });
  }
  return { ok: true };
}

async function sendTwilioMessage({ to, from, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  if (!sid || !token) throw new Error("twilio_auth_missing");
  if (!to || !from) throw new Error("twilio_to_from_missing");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const payload = new URLSearchParams({ To: to, From: from, Body: body || "" });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg || "twilio_send_failed");
  }
  return await r.json();
}

export async function sendSmsMessage(to, body, fromOverride = "") {
  const from = fromOverride || process.env.TWILIO_SMS_FROM || "";
  return await sendTwilioMessage({ to, from, body });
}

export async function sendWhatsAppMessage(to, body, fromOverride = "") {
  const token = process.env.WHATSAPP_TOKEN || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  if (token && phoneId) {
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: String(to || "").replace(/^whatsapp:/, ""),
      type: "text",
      text: { body: body || "" }
    };
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const msg = await r.text();
      throw new Error(msg || "whatsapp_send_failed");
    }
    return await r.json();
  }

  const from = fromOverride || process.env.TWILIO_WHATSAPP_FROM || "";
  const normalizedTo = String(to || "");
  const twilioTo = normalizedTo.startsWith("whatsapp:") ? normalizedTo : `whatsapp:${normalizedTo}`;
  return await sendTwilioMessage({ to: twilioTo, from, body });
}
