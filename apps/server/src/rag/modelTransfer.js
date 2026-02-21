import { listRagModels } from "./collections.js";
import {
  listTradingSources,
  listTradingRssSources,
  listTradingYoutubeSources,
  upsertRagCollection,
  upsertTradingSource,
  upsertTradingRssSource,
  upsertTradingYoutubeSource
} from "./vectorStore.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeModel(model = {}) {
  return {
    id: String(model.id || "").trim(),
    title: String(model.title || model.name || "").trim(),
    description: String(model.description || "").trim(),
    kind: String(model.kind || "custom").trim()
  };
}

function normalizeSources(list = [], type) {
  const items = Array.isArray(list) ? list : [];
  if (type === "trading") {
    return items.map(item => ({
      collectionId: String(item.collection_id || item.collectionId || "trading"),
      url: String(item.url || "").trim(),
      tags: Array.isArray(item.tags) ? item.tags : [],
      enabled: item.enabled !== false
    })).filter(item => item.url);
  }
  if (type === "rss") {
    return items.map(item => ({
      collectionId: String(item.collection_id || item.collectionId || "trading"),
      url: String(item.url || "").trim(),
      title: String(item.title || "").trim(),
      tags: Array.isArray(item.tags) ? item.tags : [],
      enabled: item.enabled !== false,
      includeForeign: Boolean(item.include_foreign ?? item.includeForeign)
    })).filter(item => item.url);
  }
  if (type === "youtube") {
    return items.map(item => ({
      collectionId: String(item.collection_id || item.collectionId || "trading"),
      channelId: String(item.channel_id || item.channelId || "").trim(),
      handle: String(item.handle || "").trim(),
      url: String(item.url || "").trim(),
      title: String(item.title || "").trim(),
      description: String(item.description || "").trim(),
      tags: Array.isArray(item.tags) ? item.tags : [],
      enabled: item.enabled !== false,
      maxVideos: Number(item.max_videos ?? item.maxVideos ?? 0) || 0
    })).filter(item => item.channelId || item.handle || item.url);
  }
  return [];
}

export function exportRagModels() {
  const models = listRagModels().map(normalizeModel);
  const trading = normalizeSources(listTradingSources({ limit: 1000, offset: 0, collectionId: "" }), "trading");
  const rss = normalizeSources(listTradingRssSources({ limit: 1000, offset: 0, collectionId: "" }), "rss");
  const youtube = normalizeSources(listTradingYoutubeSources({ limit: 1000, offset: 0, collectionId: "" }), "youtube");

  return {
    version: 1,
    exportedAt: nowIso(),
    models,
    sources: { trading, rss, youtube }
  };
}

export function importRagModels(payload = {}) {
  const models = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.collections)
      ? payload.collections
      : [];
  let modelCount = 0;
  for (const raw of models) {
    const model = normalizeModel(raw);
    if (!model.id) continue;
    if (model.kind === "built-in") continue;
    const title = model.title || model.id;
    upsertRagCollection({
      id: model.id,
      title,
      description: model.description || `Knowledge model for ${title}`,
      kind: model.kind || "custom"
    });
    modelCount += 1;
  }

  const sources = payload.sources || {};
  const trading = normalizeSources(sources.trading, "trading");
  const rss = normalizeSources(sources.rss, "rss");
  const youtube = normalizeSources(sources.youtube, "youtube");

  let tradingCount = 0;
  trading.forEach(item => {
    upsertTradingSource({
      url: item.url,
      tags: item.tags || [],
      enabled: item.enabled !== false,
      collectionId: item.collectionId || "trading"
    });
    tradingCount += 1;
  });
  let rssCount = 0;
  rss.forEach(item => {
    upsertTradingRssSource({
      url: item.url,
      title: item.title || "",
      tags: item.tags || [],
      enabled: item.enabled !== false,
      includeForeign: item.includeForeign === true,
      collectionId: item.collectionId || "trading"
    });
    rssCount += 1;
  });
  let youtubeCount = 0;
  youtube.forEach(item => {
    upsertTradingYoutubeSource({
      channelId: item.channelId || "",
      handle: item.handle || "",
      title: item.title || "",
      description: item.description || "",
      url: item.url || "",
      tags: item.tags || [],
      enabled: item.enabled !== false,
      maxVideos: item.maxVideos || 0,
      collectionId: item.collectionId || "trading"
    });
    youtubeCount += 1;
  });

  return {
    models: modelCount,
    sources: {
      trading: tradingCount,
      rss: rssCount,
      youtube: youtubeCount
    }
  };
}
