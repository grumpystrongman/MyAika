import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { nowIso } from "../storage/utils.js";
import {
  strategyEvaluate,
  riskCheck,
  placeOrder,
  getPositions,
  getAccountState,
  modifyOrder
} from "../src/trading/tools/tooling.js";

function buildSampleSnapshot() {
  return {
    symbols: [
      {
        symbol: "BTC-USD",
        assetClass: "crypto",
        interval: "1h",
        candles: [
          { t: Date.now() - 3600000, open: 30000, high: 30250, low: 29800, close: 30100, volume: 1200 },
          { t: Date.now(), open: 30100, high: 30500, low: 29950, close: 30350, volume: 980 }
        ]
      }
    ],
    fetchedAt: nowIso()
  };
}

async function main() {
  process.env.AIKA_DB_PATH = ":memory:";
  initDb();
  runMigrations();

  const snapshot = buildSampleSnapshot();
  const strategy = await strategyEvaluate({ snapshot, horizonDays: 120 });

  const proposedTrade = {
    symbol: "BTC-USD",
    side: "buy",
    quantity: 0.01,
    entryPrice: 30000,
    stopLoss: 29000,
    takeProfit: 33000,
    leverage: 1,
    assetClass: "crypto"
  };

  const risk = riskCheck({ proposedTrade, mode: "paper", userId: "smoke" });
  if (!risk.ok) {
    throw new Error(`risk_check_failed:${risk.reasons.join(",")}`);
  }

  const order = await placeOrder({
    trade: proposedTrade,
    mode: "paper",
    userId: "smoke",
    riskCheckId: risk.riskCheckId
  });

  const positions = await getPositions({ mode: "paper", userId: "smoke" });
  const account = await getAccountState({ mode: "paper", userId: "smoke" });

  const modify = await modifyOrder({
    orderId: order.orderId,
    updates: { stopLoss: 29500, takeProfit: 33500 },
    mode: "paper",
    userId: "smoke"
  });

  console.log("trading_tools_smoke_ok", {
    strategy: strategy?.signal || null,
    risk,
    order,
    positions,
    account,
    modify
  });
}

main().catch(err => {
  console.error("trading_tools_smoke_failed", err?.message || err);
  process.exit(1);
});
