import { fetchPlexIdentity } from "../../integrations/plex.js";
import { fetchFirefliesTranscripts } from "../../integrations/fireflies.js";
import { sendSlackMessage, sendTelegramMessage, sendDiscordMessage } from "../../integrations/messaging.js";

export async function plexIdentity() {
  const xml = await fetchPlexIdentity();
  return { xml };
}

export async function firefliesTranscripts({ limit = 5 }) {
  const data = await fetchFirefliesTranscripts(Number(limit || 5));
  return { transcripts: data };
}

export async function slackPost({ channel, text }) {
  const data = await sendSlackMessage(channel, text);
  return { data };
}

export async function telegramSend({ chatId, text }) {
  const data = await sendTelegramMessage(chatId, text);
  return { data };
}

export async function discordSend({ text }) {
  const data = await sendDiscordMessage(text);
  return { data };
}
