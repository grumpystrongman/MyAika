import test from "node:test";
import assert from "node:assert/strict";
import { initDb, getDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import {
  createManualTrade,
  listManualTrades,
  updateManualTrade,
  deleteManualTrade,
  summarizeManualTrades
} from "../storage/trading_manual_trades.js";

test("manual trades track pnl and lifecycle", () => {
  initDb();
  runMigrations();
  const db = getDb();
  db.prepare("DELETE FROM trading_manual_trades").run();

  const trade = createManualTrade("local", {
    symbol: "AAPL",
    assetClass: "stock",
    side: "buy",
    quantity: 10,
    entryPrice: 100,
    exitPrice: 120,
    fees: 2
  });
  assert.equal(trade.pnl, 198);
  assert.equal(trade.pnlPct, 19.8);
  assert.equal(trade.status, "closed");

  const openTrade = createManualTrade("local", {
    symbol: "TSLA",
    assetClass: "stock",
    side: "buy",
    quantity: 2,
    entryPrice: 200
  });
  assert.equal(openTrade.status, "open");

  const updated = updateManualTrade("local", trade.id, { exitPrice: 110 });
  assert.equal(updated.pnl, 98);
  assert.equal(updated.status, "closed");

  const list = listManualTrades("local", { limit: 10 });
  assert.ok(list.find(item => item.id === trade.id));

  const summary = summarizeManualTrades(list);
  assert.equal(summary.closed, 1);
  assert.equal(summary.open, 1);

  const deleted = deleteManualTrade("local", trade.id);
  assert.equal(deleted.deleted, true);
});
