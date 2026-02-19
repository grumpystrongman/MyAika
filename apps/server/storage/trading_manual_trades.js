import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

function normalizeAssetClass(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "crypto") return "crypto";
  return "stock";
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

function normalizeTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

function computeMetrics(row) {
  const quantity = toNumber(row.quantity, 0);
  const entry = toNumber(row.entry_price ?? row.entryPrice, null);
  const exit = toNumber(row.exit_price ?? row.exitPrice, null);
  const fees = toNumber(row.fees, 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(entry) || !Number.isFinite(exit)) {
    return { pnl: null, pnlPct: null, status: exit == null ? "open" : "unknown", notional: null };
  }
  const side = normalizeSide(row.side);
  const gross = side === "sell" ? (entry - exit) * quantity : (exit - entry) * quantity;
  const pnl = gross - fees;
  const notional = entry * quantity;
  const pnlPct = notional ? (pnl / notional) * 100 : null;
  return {
    pnl: Number.isFinite(pnl) ? Number(pnl.toFixed(2)) : null,
    pnlPct: Number.isFinite(pnlPct) ? Number(pnlPct.toFixed(2)) : null,
    status: exit == null ? "open" : "closed",
    notional: Number.isFinite(notional) ? Number(notional.toFixed(2)) : null
  };
}

function mapRow(row) {
  if (!row) return null;
  const metrics = computeMetrics(row);
  return {
    id: row.id,
    userId: row.user_id || "local",
    symbol: row.symbol || "",
    assetClass: row.asset_class || "stock",
    side: row.side || "buy",
    quantity: toNumber(row.quantity, 0) || 0,
    entryPrice: toNumber(row.entry_price, null),
    exitPrice: toNumber(row.exit_price, null),
    fees: toNumber(row.fees, 0) || 0,
    openedAt: row.opened_at || "",
    closedAt: row.closed_at || "",
    notes: row.notes || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    pnl: metrics.pnl,
    pnlPct: metrics.pnlPct,
    notional: metrics.notional,
    status: metrics.status
  };
}

export function listManualTrades(userId = "local", { limit = 50 } = {}) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM trading_manual_trades
     WHERE user_id = ?
     ORDER BY COALESCE(closed_at, created_at) DESC
     LIMIT ?`
  ).all(userId, Number(limit || 50));
  return rows.map(mapRow).filter(Boolean);
}

export function createManualTrade(userId = "local", input = {}) {
  const db = getDb();
  const symbol = String(input.symbol || "").trim().toUpperCase();
  if (!symbol) throw new Error("symbol_required");
  const quantity = toNumber(input.quantity, null);
  const entryPrice = toNumber(input.entryPrice ?? input.entry_price, null);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity_required");
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error("entry_price_required");

  const record = {
    id: crypto.randomUUID(),
    user_id: userId,
    symbol,
    asset_class: normalizeAssetClass(input.assetClass || input.asset_class),
    side: normalizeSide(input.side),
    quantity,
    entry_price: entryPrice,
    exit_price: toNumber(input.exitPrice ?? input.exit_price, null),
    fees: toNumber(input.fees, 0) || 0,
    opened_at: normalizeTime(input.openedAt || input.opened_at),
    closed_at: normalizeTime(input.closedAt || input.closed_at),
    notes: String(input.notes || "").trim(),
    created_at: nowIso(),
    updated_at: nowIso()
  };

  db.prepare(
    `INSERT INTO trading_manual_trades
     (id, user_id, symbol, asset_class, side, quantity, entry_price, exit_price, fees, opened_at, closed_at, notes, created_at, updated_at)
     VALUES (@id, @user_id, @symbol, @asset_class, @side, @quantity, @entry_price, @exit_price, @fees, @opened_at, @closed_at, @notes, @created_at, @updated_at)`
  ).run(record);
  return mapRow(record);
}

export function updateManualTrade(userId = "local", id, patch = {}) {
  if (!id) throw new Error("trade_id_required");
  const db = getDb();
  const existing = db.prepare("SELECT * FROM trading_manual_trades WHERE user_id = ? AND id = ?").get(userId, id);
  if (!existing) throw new Error("trade_not_found");
  const next = {
    symbol: String(patch.symbol || existing.symbol || "").trim().toUpperCase() || existing.symbol,
    asset_class: normalizeAssetClass(patch.assetClass || patch.asset_class || existing.asset_class),
    side: normalizeSide(patch.side || existing.side),
    quantity: toNumber(patch.quantity ?? existing.quantity, existing.quantity),
    entry_price: toNumber(patch.entryPrice ?? patch.entry_price ?? existing.entry_price, existing.entry_price),
    exit_price: toNumber(patch.exitPrice ?? patch.exit_price ?? existing.exit_price, existing.exit_price),
    fees: toNumber(patch.fees ?? existing.fees, existing.fees),
    opened_at: normalizeTime(patch.openedAt || patch.opened_at || existing.opened_at),
    closed_at: normalizeTime(patch.closedAt || patch.closed_at || existing.closed_at),
    notes: String(patch.notes ?? existing.notes ?? "").trim(),
    updated_at: nowIso()
  };

  db.prepare(
    `UPDATE trading_manual_trades
     SET symbol = @symbol,
         asset_class = @asset_class,
         side = @side,
         quantity = @quantity,
         entry_price = @entry_price,
         exit_price = @exit_price,
         fees = @fees,
         opened_at = @opened_at,
         closed_at = @closed_at,
         notes = @notes,
         updated_at = @updated_at
     WHERE id = @id AND user_id = @user_id`
  ).run({ ...next, id, user_id: userId });
  return mapRow({ ...existing, ...next });
}

export function deleteManualTrade(userId = "local", id) {
  if (!id) throw new Error("trade_id_required");
  const db = getDb();
  const info = db.prepare("DELETE FROM trading_manual_trades WHERE user_id = ? AND id = ?").run(userId, id);
  return { deleted: info.changes > 0 };
}

export function summarizeManualTrades(trades = []) {
  if (!trades.length) {
    return { count: 0, closed: 0, open: 0, winners: 0, losers: 0, winRate: 0, totalPnl: 0, avgPnl: 0, avgPnlPct: 0 };
  }
  let closed = 0;
  let open = 0;
  let winners = 0;
  let losers = 0;
  let totalPnl = 0;
  let totalPnlPct = 0;
  trades.forEach(trade => {
    if (trade.status === "open") {
      open += 1;
      return;
    }
    closed += 1;
    const pnl = toNumber(trade.pnl, 0);
    const pnlPct = toNumber(trade.pnlPct, 0);
    totalPnl += pnl;
    totalPnlPct += pnlPct;
    if (pnl > 0) winners += 1;
    if (pnl < 0) losers += 1;
  });
  const avgPnl = closed ? totalPnl / closed : 0;
  const avgPnlPct = closed ? totalPnlPct / closed : 0;
  const winRate = closed ? (winners / closed) * 100 : 0;
  return {
    count: trades.length,
    closed,
    open,
    winners,
    losers,
    winRate: Number(winRate.toFixed(1)),
    totalPnl: Number(totalPnl.toFixed(2)),
    avgPnl: Number(avgPnl.toFixed(2)),
    avgPnlPct: Number(avgPnlPct.toFixed(2))
  };
}
