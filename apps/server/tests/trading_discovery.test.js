import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscoveryUniverse } from "../src/trading/discovery.js";

test("discovery universe merges watchlist + discoveries with stable ordering", () => {
  const result = buildDiscoveryUniverse({
    watchlist: ["AAPL", "BTC-USD"],
    discovered: ["MSFT", "ETH-USD", "AAPL"],
    assetClass: "all",
    max: 10
  });
  assert.deepEqual(result, ["AAPL", "BTC-USD", "MSFT", "ETH-USD"]);
});

test("discovery universe filters by asset class", () => {
  const result = buildDiscoveryUniverse({
    watchlist: ["AAPL", "BTC-USD"],
    discovered: ["MSFT", "ETH-USD"],
    assetClass: "stock",
    max: 10
  });
  assert.deepEqual(result, ["AAPL", "MSFT"]);
});
