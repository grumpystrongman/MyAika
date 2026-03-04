import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = global.fetch;
const originalCacheTtl = process.env.TRADING_MARKET_DATA_CACHE_TTL_MS;

test.after(() => {
  global.fetch = originalFetch;
  if (originalCacheTtl === undefined) {
    delete process.env.TRADING_MARKET_DATA_CACHE_TTL_MS;
  } else {
    process.env.TRADING_MARKET_DATA_CACHE_TTL_MS = originalCacheTtl;
  }
});

test("market data cache avoids repeated fetches", async () => {
  process.env.TRADING_MARKET_DATA_CACHE_TTL_MS = "60000";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => {
        const now = Math.floor(Date.now() / 1000);
        return [
          [now - 60, 100, 110, 90, 105, 123],
          [now, 105, 120, 100, 115, 100]
        ];
      }
    };
  };

  const { fetchMarketCandles, resetMarketDataCache } = await import("../src/trading/marketData.js");
  resetMarketDataCache();

  const first = await fetchMarketCandles({ symbol: "BTC-USD", assetClass: "crypto", interval: "1h", limit: 2 });
  const second = await fetchMarketCandles({ symbol: "BTC-USD", assetClass: "crypto", interval: "1h", limit: 2 });

  assert.equal(calls, 1);
  assert.equal(first.candles.length, 2);
  assert.equal(second.candles.length, 2);
  assert.equal(second.source, first.source);
});
