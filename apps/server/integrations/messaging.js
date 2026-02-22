import { getProvider, setProvider } from "./store.js";
import { getMetaToken } from "./meta.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

function nowIso() {
  return new Date().toISOString();
}

function getTelegramToken() {
  const stored = getProvider("telegram") || {};
  return stored.token || process.env.TELEGRAM_BOT_TOKEN || "";
}

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    return ffmpegPath;
  }
  return null;
}

function runFfmpeg(args) {
  const exe = resolveFfmpeg();
  if (!exe) return false;
  const result = spawnSync(exe, args, { stdio: "ignore" });
  return result.status === 0;
}

function guessAudioMimeType(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  if (ext === ".ogg" || ext === ".oga") return "audio/ogg";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}

function buildTelegramFileUrl(token, filePath) {
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

async function sendTelegramFile({ chatId, filePath, field, method, mimeType, filename, caption }) {
  const token = getTelegramToken();
  if (!token) throw new Error("telegram_token_missing");
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const buffer = await fs.promises.readFile(filePath);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append(field, new Blob([buffer], { type: mimeType }), filename);
  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg || "telegram_send_failed");
  }
  return await r.json();
}

async function ensureOggOpus(inputPath) {
  const ext = path.extname(inputPath || "").toLowerCase();
  if (ext === ".ogg" || ext === ".oga") {
    return { path: inputPath, cleanup: false, mime: "audio/ogg" };
  }
  const exe = resolveFfmpeg();
  if (!exe) return { path: "", cleanup: false, mime: "" };
  const outPath = path.join(os.tmpdir(), `aika_voice_${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`);
  const ok = runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-c:a",
    "libopus",
    "-b:a",
    "24k",
    "-vbr",
    "on",
    "-application",
    "voip",
    outPath
  ]);
  if (!ok || !fs.existsSync(outPath)) return { path: "", cleanup: false, mime: "" };
  return { path: outPath, cleanup: true, mime: "audio/ogg" };
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

export async function downloadTelegramFile({ fileId, destDir } = {}) {
  const token = getTelegramToken();
  if (!token) throw new Error("telegram_token_missing");
  if (!fileId) throw new Error("telegram_file_id_missing");
  const infoResp = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId })
  });
  const info = await infoResp.json().catch(() => ({}));
  if (!infoResp.ok || !info?.ok || !info?.result?.file_path) {
    throw new Error(info?.description || "telegram_get_file_failed");
  }
  const filePath = info.result.file_path;
  const ext = path.extname(filePath || "") || ".dat";
  const baseDir = destDir || path.join(os.tmpdir(), "aika_telegram");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const localPath = path.join(
    baseDir,
    `tg_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
  );
  const fileUrl = buildTelegramFileUrl(token, filePath);
  const fileResp = await fetch(fileUrl);
  if (!fileResp.ok) throw new Error("telegram_file_download_failed");
  const buffer = Buffer.from(await fileResp.arrayBuffer());
  await fs.promises.writeFile(localPath, buffer);
  return { path: localPath, size: buffer.length, filePath };
}

export async function sendTelegramVoiceNote(chatId, filePath, caption = "") {
  const voice = await ensureOggOpus(filePath);
  let cleanup = null;
  try {
    if (voice?.path) {
      cleanup = voice.cleanup ? voice.path : null;
      const result = await sendTelegramFile({
        chatId,
        filePath: voice.path,
        field: "voice",
        method: "sendVoice",
        mimeType: voice.mime || "audio/ogg",
        filename: "aika.ogg",
        caption
      });
      const stored = getProvider("telegram") || {};
      if (stored && Object.keys(stored).length) {
        setProvider("telegram", { ...stored, lastUsedAt: nowIso() });
      }
      return result;
    }
    const mimeType = guessAudioMimeType(filePath);
    const result = await sendTelegramFile({
      chatId,
      filePath,
      field: "audio",
      method: "sendAudio",
      mimeType,
      filename: `aika${path.extname(filePath) || ".wav"}`,
      caption
    });
    const stored = getProvider("telegram") || {};
    if (stored && Object.keys(stored).length) {
      setProvider("telegram", { ...stored, lastUsedAt: nowIso() });
    }
    return result;
  } finally {
    if (cleanup) {
      try { fs.unlinkSync(cleanup); } catch {}
    }
  }
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
  const token = process.env.WHATSAPP_TOKEN || getMetaToken("whatsapp") || "";
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
