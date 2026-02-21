import assert from "node:assert/strict";
import test from "node:test";
import {
  initRagStore,
  upsertRagCollection,
  getRagCollection,
  deleteRagCollection,
  upsertTradingSource,
  listTradingSources,
  deleteTradingSource,
  upsertTradingRssSource,
  listTradingRssSources,
  deleteTradingRssSource,
  upsertTradingYoutubeSource,
  listTradingYoutubeSources,
  deleteTradingYoutubeSource
} from "../src/rag/vectorStore.js";
import { exportRagModels, importRagModels } from "../src/rag/modelTransfer.js";

test("exports and imports custom models + sources", () => {
  initRagStore();
  const stamp = Date.now();
  const collectionId = `test-${stamp}`;
  const tradingUrl = `https://example.com/trading-${stamp}`;
  const rssUrl = `https://example.com/rss-${stamp}.xml`;
  const ytHandle = `@test${stamp}`;

  let tradingSource = null;
  let rssSource = null;
  let ytSource = null;

  const cleanup = () => {
    const trading = listTradingSources({ collectionId, limit: 50, offset: 0, includeDisabled: true });
    trading.filter(source => source.url === tradingUrl).forEach(source => deleteTradingSource(source.id));
    const rss = listTradingRssSources({ collectionId, limit: 50, offset: 0, includeDisabled: true });
    rss.filter(source => source.url === rssUrl).forEach(source => deleteTradingRssSource(source.id));
    const youtube = listTradingYoutubeSources({ collectionId, limit: 50, offset: 0, includeDisabled: true });
    youtube.filter(source => source.handle === ytHandle).forEach(source => deleteTradingYoutubeSource(source.id));
    deleteRagCollection(collectionId);
  };

  try {
    upsertRagCollection({
      id: collectionId,
      title: `Test ${collectionId}`,
      description: "test",
      kind: "custom"
    });
    tradingSource = upsertTradingSource({
      url: tradingUrl,
      tags: ["test"],
      enabled: true,
      collectionId
    });
    rssSource = upsertTradingRssSource({
      url: rssUrl,
      title: "Test RSS",
      tags: ["test"],
      enabled: true,
      includeForeign: false,
      collectionId
    });
    ytSource = upsertTradingYoutubeSource({
      handle: ytHandle,
      title: "Test YT",
      description: "test",
      tags: ["test"],
      enabled: true,
      maxVideos: 3,
      collectionId
    });

    assert.ok(tradingSource?.id);
    assert.ok(rssSource?.id);
    assert.ok(ytSource?.id);

    const exported = exportRagModels();
    assert.ok(exported.models.some(model => model.id === collectionId));
    assert.ok(exported.sources.trading.some(source => source.url === tradingUrl));
    assert.ok(exported.sources.rss.some(source => source.url === rssUrl));
    assert.ok(exported.sources.youtube.some(source => source.handle === ytHandle));

    deleteTradingSource(tradingSource.id);
    deleteTradingRssSource(rssSource.id);
    deleteTradingYoutubeSource(ytSource.id);
    deleteRagCollection(collectionId);

    const imported = importRagModels(exported);
    assert.ok(imported.models >= 1);

    assert.ok(getRagCollection(collectionId));
    const tradingRestored = listTradingSources({ collectionId, limit: 50, offset: 0, includeDisabled: true });
    assert.ok(tradingRestored.some(source => source.url === tradingUrl));
    const rssRestored = listTradingRssSources({ collectionId, limit: 50, offset: 0, includeDisabled: true });
    assert.ok(rssRestored.some(source => source.url === rssUrl));
    const youtubeRestored = listTradingYoutubeSources({ collectionId, limit: 50, offset: 0, includeDisabled: true });
    assert.ok(youtubeRestored.some(source => source.handle === ytHandle));
  } finally {
    cleanup();
  }
});
