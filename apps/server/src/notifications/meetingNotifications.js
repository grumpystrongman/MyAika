import { getMeetingNotification, recordMeetingNotification } from "../rag/vectorStore.js";
import { sendTelegramMessage, sendWhatsAppMessage, sendSmsMessage } from "../../integrations/messaging.js";
import { executeAction } from "../safety/executeAction.js";

function parseList(value) {
  return String(value || "")
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parseChannels(value) {
  return parseList(value).map(item => {
    const normalized = item.toLowerCase();
    if (["sms", "text", "messages", "message"].includes(normalized)) return "sms";
    if (["whatsapp", "wa"].includes(normalized)) return "whatsapp";
    if (["telegram", "tg"].includes(normalized)) return "telegram";
    return normalized;
  }).filter(Boolean);
}

function limitText(value, max) {
  const text = String(value || "").trim();
  if (!max || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatActionItems(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return items
    .slice(0, 5)
    .map(item => {
      if (typeof item === "string") return item;
      if (item?.task) return item.task;
      if (item?.title) return item.title;
      if (item?.text) return item.text;
      return "";
    })
    .filter(Boolean)
    .map(text => `- ${text}`)
    .join("\n");
}

function buildNotificationText({ title, occurredAt, summary, sourceUrl }) {
  const tldr = summary?.tldr || "";
  const overview = Array.isArray(summary?.overview) ? summary.overview.join(" ") : "";
  const actionItems = summary?.actionItems || summary?.tasks || [];
  const actionBlock = formatActionItems(actionItems);
  const lines = [
    `Aika meeting update: ${title || "Meeting"}`,
    occurredAt ? `Date: ${occurredAt}` : "",
    "",
    "Summary:",
    tldr || overview || "Summary pending.",
    "",
    actionBlock ? "Action Items:" : "",
    actionBlock,
    sourceUrl ? `Source: ${sourceUrl}` : ""
  ].filter(Boolean);
  return lines.join("\n").trim();
}

async function notifyTelegram({ meetingId, text }) {
  const chatIds = parseList(process.env.TELEGRAM_CHAT_ID);
  if (!chatIds.length) throw new Error("telegram_chat_id_missing");
  const result = await executeAction({
    actionType: "messaging.telegramSend",
    params: { chatIds, text },
    context: { userId: "system" },
    outboundTargets: ["https://api.telegram.org"],
    summary: "Send Telegram meeting notification",
    handler: async () => {
      for (const chatId of chatIds) {
        await sendTelegramMessage(chatId, text);
      }
      return { sent: true };
    }
  });
  if (result.status === "approval_required") {
    recordMeetingNotification({
      meetingId,
      channel: "telegram",
      to: chatIds,
      status: "approval_required",
      error: "approval_required"
    });
    return { sent: false, status: "approval_required" };
  }
  recordMeetingNotification({
    meetingId,
    channel: "telegram",
    to: chatIds,
    status: "sent",
    sentAt: new Date().toISOString()
  });
  return { sent: true, count: chatIds.length };
}

async function notifyWhatsApp({ meetingId, text }) {
  const recipients = parseList(process.env.WHATSAPP_TO || process.env.TWILIO_WHATSAPP_TO);
  if (!recipients.length) throw new Error("whatsapp_to_missing");
  const result = await executeAction({
    actionType: "messaging.whatsapp.send",
    params: { to: recipients, text },
    context: { userId: "system" },
    outboundTargets: ["https://graph.facebook.com", "https://api.twilio.com"],
    summary: "Send WhatsApp meeting notification",
    handler: async () => {
      for (const to of recipients) {
        await sendWhatsAppMessage(to, text);
      }
      return { sent: true };
    }
  });
  if (result.status === "approval_required") {
    recordMeetingNotification({
      meetingId,
      channel: "whatsapp",
      to: recipients,
      status: "approval_required",
      error: "approval_required"
    });
    return { sent: false, status: "approval_required" };
  }
  recordMeetingNotification({
    meetingId,
    channel: "whatsapp",
    to: recipients,
    status: "sent",
    sentAt: new Date().toISOString()
  });
  return { sent: true, count: recipients.length };
}

async function notifySms({ meetingId, text }) {
  const recipients = parseList(process.env.TWILIO_SMS_TO);
  if (!recipients.length) throw new Error("sms_to_missing");
  const result = await executeAction({
    actionType: "messaging.sms.send",
    params: { to: recipients, text },
    context: { userId: "system" },
    outboundTargets: ["https://api.twilio.com"],
    summary: "Send SMS meeting notification",
    handler: async () => {
      for (const to of recipients) {
        await sendSmsMessage(to, text);
      }
      return { sent: true };
    }
  });
  if (result.status === "approval_required") {
    recordMeetingNotification({
      meetingId,
      channel: "sms",
      to: recipients,
      status: "approval_required",
      error: "approval_required"
    });
    return { sent: false, status: "approval_required" };
  }
  recordMeetingNotification({
    meetingId,
    channel: "sms",
    to: recipients,
    status: "sent",
    sentAt: new Date().toISOString()
  });
  return { sent: true, count: recipients.length };
}

export function parseNotifyChannels(value) {
  return parseChannels(value);
}

export async function sendMeetingNotifications({
  meetingId,
  title,
  occurredAt,
  summary,
  sourceUrl,
  channels = [],
  force = false
} = {}) {
  const normalized = Array.isArray(channels) ? channels : parseChannels(channels);
  if (!meetingId || !normalized.length) return { sent: false, channels: [] };

  const text = buildNotificationText({ title, occurredAt, summary, sourceUrl });
  const smsText = limitText(text, Number(process.env.SMS_MAX_CHARS || 1200));

  const sentChannels = [];
  const skippedChannels = [];
  for (const channel of normalized) {
    const existing = getMeetingNotification(meetingId, channel);
    if (existing?.status === "sent" && !force) {
      skippedChannels.push(channel);
      continue;
    }
    try {
      if (channel === "telegram") {
        await notifyTelegram({ meetingId, text });
      } else if (channel === "whatsapp") {
        await notifyWhatsApp({ meetingId, text });
      } else if (channel === "sms") {
        await notifySms({ meetingId, text: smsText });
      }
      sentChannels.push(channel);
    } catch (err) {
      recordMeetingNotification({
        meetingId,
        channel,
        to: [],
        status: "failed",
        error: String(err?.message || err)
      });
    }
  }

  return { sent: sentChannels.length > 0, sentChannels, skippedChannels };
}
