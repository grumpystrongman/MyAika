import { fetchPlexIdentity } from "../../integrations/plex.js";
import { fetchFirefliesTranscripts } from "../../integrations/fireflies.js";
import { sendSlackMessage, sendTelegramMessage, sendDiscordMessage } from "../../integrations/messaging.js";
import { fetchCurrentWeather } from "../../integrations/weather.js";
import { searchWeb } from "../../integrations/web_search.js";
import { buildAmazonAddToCartUrl, runProductResearch } from "../../integrations/product_research.js";
import { writeOutbox } from "../../storage/outbox.js";

export async function plexIdentity({ mode = "localStub", token } = {}) {
  if (mode !== "real") {
    return { username: "AikaLocal", id: "local-plex", email: "", mode: "stub" };
  }
  const xml = await fetchPlexIdentity(token);
  return { xml, mode: "real" };
}

export async function firefliesTranscripts({ mode = "stub", limit = 25 } = {}) {
  if (mode !== "real") {
    return {
      transcripts: Array.from({ length: Math.min(Number(limit || 5), 5) }).map((_, i) => ({
        id: `stub-${i + 1}`,
        title: `Stub Meeting ${i + 1}`,
        date: new Date(Date.now() - i * 86400000).toISOString()
      }))
    };
  }
  const data = await fetchFirefliesTranscripts(Number(limit || 5));
  return { transcripts: data?.data?.transcripts || data?.transcripts || [] };
}

export async function slackPost({ channel, message }) {
  try {
    const data = await sendSlackMessage(channel, message);
    return { data, transport: "slack" };
  } catch (err) {
    const outbox = writeOutbox({ type: "slack", channel, message, transport: "stub", error: String(err) });
    return { data: outbox.record, transport: "stub" };
  }
}

export async function telegramSend({ chatId, message }) {
  try {
    const data = await sendTelegramMessage(chatId, message);
    return { data, transport: "telegram" };
  } catch (err) {
    const outbox = writeOutbox({ type: "telegram", chatId, message, transport: "stub", error: String(err) });
    return { data: outbox.record, transport: "stub" };
  }
}

export async function discordSend({ channelId, message }) {
  try {
    const data = await sendDiscordMessage(message);
    return { data, transport: "discord" };
  } catch (err) {
    const outbox = writeOutbox({ type: "discord", channelId, message, transport: "stub", error: String(err) });
    return { data: outbox.record, transport: "stub" };
  }
}

export async function weatherCurrent({ location }) {
  const weather = await fetchCurrentWeather(location);
  return weather;
}

export async function webSearch({ query, limit = 5 }) {
  const result = await searchWeb(query, limit);
  return result;
}

export async function shoppingProductResearch({ query, budget = null, limit = 8, context = "" }) {
  return runProductResearch({
    query: context ? `${query} ${context}`.trim() : query,
    budget,
    limit
  });
}

export async function shoppingAmazonAddToCart({ asin, quantity = 1 }) {
  const addToCartUrl = buildAmazonAddToCartUrl({ asin, quantity });
  const qty = Math.max(1, Math.min(10, Math.floor(Number(quantity) || 1)));
  return {
    asin,
    quantity: qty,
    addToCartUrl,
    note: "Open this URL while signed in to Amazon to add to cart."
  };
}
