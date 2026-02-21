import crypto from "node:crypto";
import { getDb } from "../../../storage/db.js";
import { nowIso } from "../../../storage/utils.js";

const DEFAULT_EQUITY = Number(process.env.PAPER_ACCOUNT_EQUITY || 10000);

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function resolveAccountId(userId = "local", mode = "paper") {
  return `${userId}:${mode}`;
}

function normalizeSide(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "sell" || raw === "short") return "sell";
  return "buy";
}

function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureAccount(userId = "local", mode = "paper") {
  const db = getDb();
  const accountId = resolveAccountId(userId, mode);
  const existing = db.prepare("SELECT * FROM trading_accounts WHERE id = ?").get(accountId);
  if (existing) return existing;
  const now = nowIso();
  const equity = DEFAULT_EQUITY;
  db.prepare(
    `INSERT INTO trading_accounts (id, user_id, mode, equity, cash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(accountId, userId, mode, equity, equity, now, now);
  return db.prepare("SELECT * FROM trading_accounts WHERE id = ?").get(accountId);
}

function getAccount(userId = "local", mode = "paper") {
  const db = getDb();
  const accountId = resolveAccountId(userId, mode);
  const row = db.prepare("SELECT * FROM trading_accounts WHERE id = ?").get(accountId);
  return row || ensureAccount(userId, mode);
}

function listPositions(accountId) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM trading_positions WHERE account_id = ? ORDER BY opened_at ASC"
  ).all(accountId);
  return rows.map(row => ({
    id: row.id,
    symbol: row.symbol,
    assetClass: row.asset_class,
    side: row.side,
    quantity: row.quantity,
    entryPrice: row.entry_price,
    leverage: row.leverage,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    openedAt: row.opened_at,
    updatedAt: row.updated_at
  }));
}

function getDailyPnl(accountId, day) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM trading_daily_pnl WHERE account_id = ? AND day = ?"
  ).get(accountId, day);
}

function updateDailyPnl(accountId, deltaPnl) {
  const db = getDb();
  const day = todayKey();
  const existing = getDailyPnl(accountId, day);
  const next = (existing?.realized_pnl || 0) + deltaPnl;
  if (existing) {
    db.prepare(
      "UPDATE trading_daily_pnl SET realized_pnl = ?, updated_at = ? WHERE id = ?"
    ).run(next, nowIso(), existing.id);
    return { ...existing, realized_pnl: next };
  }
  const id = makeId();
  db.prepare(
    "INSERT INTO trading_daily_pnl (id, account_id, day, realized_pnl, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, accountId, day, next, nowIso());
  return { id, account_id: accountId, day, realized_pnl: next };
}

function updateAccountEquity(accountId, deltaPnl) {
  const db = getDb();
  const account = db.prepare("SELECT * FROM trading_accounts WHERE id = ?").get(accountId);
  if (!account) return null;
  const equity = Number(account.equity || 0) + deltaPnl;
  const cash = Number(account.cash || 0) + deltaPnl;
  const updatedAt = nowIso();
  db.prepare(
    "UPDATE trading_accounts SET equity = ?, cash = ?, updated_at = ? WHERE id = ?"
  ).run(equity, cash, updatedAt, accountId);
  return { ...account, equity, cash, updated_at: updatedAt };
}

function upsertPosition({ accountId, symbol, assetClass, side, quantity, entryPrice, leverage, stopLoss, takeProfit }) {
  const db = getDb();
  const existing = db.prepare(
    "SELECT * FROM trading_positions WHERE account_id = ? AND symbol = ?"
  ).get(accountId, symbol);
  const now = nowIso();
  if (existing) {
    db.prepare(
      `UPDATE trading_positions
       SET side = ?, quantity = ?, entry_price = ?, leverage = ?, stop_loss = ?, take_profit = ?, updated_at = ?
       WHERE id = ?`
    ).run(side, quantity, entryPrice, leverage, stopLoss, takeProfit, now, existing.id);
    return { id: existing.id, updatedAt: now };
  }
  const id = makeId();
  db.prepare(
    `INSERT INTO trading_positions
     (id, account_id, symbol, asset_class, side, quantity, entry_price, leverage, stop_loss, take_profit, opened_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, accountId, symbol, assetClass, side, quantity, entryPrice, leverage, stopLoss, takeProfit, now, now);
  return { id, updatedAt: now };
}

function removePosition(accountId, symbol) {
  const db = getDb();
  db.prepare("DELETE FROM trading_positions WHERE account_id = ? AND symbol = ?").run(accountId, symbol);
}

function recordOrder(order) {
  const db = getDb();
  db.prepare(
    `INSERT INTO trading_orders
     (id, account_id, symbol, asset_class, side, quantity, type, price, status, fill_price, filled_at, leverage, stop_loss, take_profit, risk_check_id, mode, created_at, updated_at)
     VALUES (@id, @account_id, @symbol, @asset_class, @side, @quantity, @type, @price, @status, @fill_price, @filled_at, @leverage, @stop_loss, @take_profit, @risk_check_id, @mode, @created_at, @updated_at)`
  ).run(order);
  return order;
}

function computePnl({ side, entryPrice, exitPrice, quantity }) {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(quantity)) return 0;
  const dir = normalizeSide(side) === "buy" ? 1 : -1;
  return (exitPrice - entryPrice) * quantity * dir;
}

export function getPaperPositions(userId = "local") {
  const account = getAccount(userId, "paper");
  return listPositions(account.id);
}

export function getPaperAccountState(userId = "local") {
  const account = getAccount(userId, "paper");
  const positions = listPositions(account.id);
  const daily = getDailyPnl(account.id, todayKey());
  return {
    accountId: account.id,
    mode: "paper",
    equity: Number(account.equity || 0),
    cash: Number(account.cash || 0),
    openPositions: positions.length,
    dailyPnl: Number(daily?.realized_pnl || 0),
    updatedAt: account.updated_at || account.updatedAt || null
  };
}

export function placePaperOrder({ userId = "local", trade = {}, price, riskCheckId = "" } = {}) {
  const account = getAccount(userId, "paper");
  const accountId = account.id;
  const symbol = String(trade.symbol || "").trim().toUpperCase();
  if (!symbol) throw new Error("symbol_required");
  const assetClass = String(trade.assetClass || trade.asset_class || "crypto").trim().toLowerCase() || "crypto";
  const side = normalizeSide(trade.side || "buy");
  const quantity = toNumber(trade.quantity, null);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity_required");
  const fillPrice = toNumber(price ?? trade.price ?? trade.entryPrice ?? trade.entry_price, null);
  if (!Number.isFinite(fillPrice) || fillPrice <= 0) throw new Error("price_required");
  const leverage = toNumber(trade.leverage, 1) || 1;
  const stopLoss = toNumber(trade.stopLoss ?? trade.stop_loss, null);
  const takeProfit = toNumber(trade.takeProfit ?? trade.take_profit, null);

  const existing = listPositions(accountId).find(pos => pos.symbol === symbol);
  let realizedPnl = 0;
  let newSide = side;
  let newQty = quantity;
  let newEntry = fillPrice;

  if (existing) {
    const sameSide = normalizeSide(existing.side) === side;
    if (sameSide) {
      const combinedQty = existing.quantity + quantity;
      newEntry = ((existing.entryPrice * existing.quantity) + (fillPrice * quantity)) / combinedQty;
      newQty = combinedQty;
      newSide = existing.side;
    } else {
      if (quantity < existing.quantity) {
        realizedPnl = computePnl({ side: existing.side, entryPrice: existing.entryPrice, exitPrice: fillPrice, quantity });
        newQty = existing.quantity - quantity;
        newEntry = existing.entryPrice;
        newSide = existing.side;
      } else if (quantity === existing.quantity) {
        realizedPnl = computePnl({ side: existing.side, entryPrice: existing.entryPrice, exitPrice: fillPrice, quantity });
        newQty = 0;
      } else {
        realizedPnl = computePnl({ side: existing.side, entryPrice: existing.entryPrice, exitPrice: fillPrice, quantity: existing.quantity });
        newQty = quantity - existing.quantity;
        newSide = side;
        newEntry = fillPrice;
      }
    }
  }

  if (newQty > 0) {
    upsertPosition({
      accountId,
      symbol,
      assetClass,
      side: newSide,
      quantity: newQty,
      entryPrice: newEntry,
      leverage,
      stopLoss,
      takeProfit
    });
  } else if (existing) {
    removePosition(accountId, symbol);
  }

  if (realizedPnl !== 0) {
    updateDailyPnl(accountId, realizedPnl);
    updateAccountEquity(accountId, realizedPnl);
  }

  const now = nowIso();
  const order = recordOrder({
    id: makeId(),
    account_id: accountId,
    symbol,
    asset_class: assetClass,
    side,
    quantity,
    type: String(trade.type || "market"),
    price: fillPrice,
    status: "filled",
    fill_price: fillPrice,
    filled_at: now,
    leverage,
    stop_loss: stopLoss,
    take_profit: takeProfit,
    risk_check_id: riskCheckId || "",
    mode: "paper",
    created_at: now,
    updated_at: now
  });

  return {
    orderId: order.id,
    status: order.status,
    fillPrice: order.fill_price,
    filledAt: order.filled_at,
    realizedPnl
  };
}

export function modifyPaperOrder({ userId = "local", orderId, updates = {} } = {}) {
  if (!orderId) throw new Error("order_id_required");
  const db = getDb();
  const accountId = resolveAccountId(userId, "paper");
  const order = db.prepare("SELECT * FROM trading_orders WHERE id = ? AND account_id = ?").get(orderId, accountId);
  if (!order) throw new Error("order_not_found");
  const stopLoss = toNumber(updates.stopLoss ?? updates.stop_loss ?? order.stop_loss, order.stop_loss);
  const takeProfit = toNumber(updates.takeProfit ?? updates.take_profit ?? order.take_profit, order.take_profit);
  const updatedAt = nowIso();
  db.prepare(
    "UPDATE trading_orders SET stop_loss = ?, take_profit = ?, updated_at = ? WHERE id = ?"
  ).run(stopLoss, takeProfit, updatedAt, orderId);
  const position = db.prepare(
    "SELECT * FROM trading_positions WHERE account_id = ? AND symbol = ?"
  ).get(accountId, order.symbol);
  if (position) {
    db.prepare(
      "UPDATE trading_positions SET stop_loss = ?, take_profit = ?, updated_at = ? WHERE id = ?"
    ).run(stopLoss, takeProfit, updatedAt, position.id);
  }
  return { ok: true, orderId, stopLoss, takeProfit };
}

export function resolvePaperAccountId(userId = "local") {
  return resolveAccountId(userId, "paper");
}
