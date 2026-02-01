import { getProvider } from "./store.js";

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
  return { ok: true };
}
