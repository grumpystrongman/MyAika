import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { getTradingSettings, updateTradingSettings } from "../storage/trading_settings.js";

initDb();
runMigrations();

test("trading settings ui defaults and updates", () => {
  const defaults = getTradingSettings("ui-test");
  assert.equal(defaults.ui.defaultAssetClass, "stock");
  assert.equal(defaults.ui.defaultStockSymbol, "NVDA");
  assert.equal(defaults.ui.defaultCryptoSymbol, "BTC-USD");

  const updated = updateTradingSettings("ui-test", {
    ui: {
      defaultAssetClass: "crypto",
      defaultStockSymbol: "AAPL",
      defaultCryptoSymbol: "ETH-USD"
    }
  });
  assert.equal(updated.ui.defaultAssetClass, "crypto");
  assert.equal(updated.ui.defaultStockSymbol, "AAPL");
  assert.equal(updated.ui.defaultCryptoSymbol, "ETH-USD");
});
