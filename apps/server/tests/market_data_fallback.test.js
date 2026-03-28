import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = global.fetch;
const originalKey = process.env.ALPACA_DATA_KEY;
const originalSecret = process.env.ALPACA_DATA_SECRET;
const originalCacheTtl = process.env.TRADING_MARKET_DATA_CACHE_TTL_MS;

test.after(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ALPACA_DATA_KEY;
  else process.env.ALPACA_DATA_KEY = originalKey;
  if (originalSecret === undefined) delete process.env.ALPACA_DATA_SECRET;
  else process.env.ALPACA_DATA_SECRET = originalSecret;
  if (originalCacheTtl === undefined) delete process.env.TRADING_MARKET_DATA_CACHE_TTL_MS;
  else process.env.TRADING_MARKET_DATA_CACHE_TTL_MS = originalCacheTtl;
});

test("market data falls back to daily when alpaca returns empty", async () => {
  process.env.ALPACA_DATA_KEY = "test";
  process.env.ALPACA_DATA_SECRET = "test";
  process.env.TRADING_MARKET_DATA_CACHE_TTL_MS = "0";

  global.fetch = async (url) => {
    const href = String(url || "");
    if (href.includes("data.alpaca.markets")) {
      return {
        ok: true,
        json: async () => ({ bars: [] })
      };
    }
    if (href.includes("stooq.com")) {
      return {
        ok: true,
        text: async () => "Date,Open,High,Low,Close,Volume\n2024-01-01,100,110,90,105,1000\n2024-01-02,105,115,95,110,1500"
      };
    }
    return { ok: false, text: async () => "", json: async () => ({}) };
  };

  const { fetchMarketCandles, resetMarketDataCache } = await import("../src/trading/marketData.js");
  resetMarketDataCache();

  const result = await fetchMarketCandles({ symbol: "NVDA", assetClass: "stock", interval: "1m", limit: 50 });
  assert.ok(result.candles.length > 0);
  assert.equal(result.interval, "1d");
  assert.equal(result.source, "stooq");
  assert.ok(String(result.warning || "").includes("Market closed") || String(result.warning || "").includes("daily bars"));
});
