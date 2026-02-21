import { getTradingSettings } from "../../../storage/trading_settings.js";
import { nowIso } from "../../../storage/utils.js";

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function resolveRelayUrl(userId = "local") {
  const explicit = normalizeUrl(
    process.env.COINBASE_TRADE_API_URL ||
    process.env.COINBASE_TRADE_RELAY_URL ||
    ""
  );
  if (explicit) return explicit;
  const settings = getTradingSettings(userId);
  const fallback = normalizeUrl(settings?.engine?.tradeApiUrl || process.env.TRADING_API_URL || "");
  return fallback;
}

function resolveRelayToken() {
  const token = String(
    process.env.COINBASE_TRADE_TOKEN ||
    process.env.TRADING_RELAY_TOKEN ||
    ""
  ).trim();
  return token || "";
}

function resolveTimeoutMs() {
  const val = Number(process.env.COINBASE_TRADE_TIMEOUT_MS || 12000);
  return Number.isFinite(val) && val > 0 ? val : 12000;
}

function shouldAutoExecute() {
  const raw = String(process.env.COINBASE_TRADE_AUTO_EXECUTE || "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function buildHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "AikaTrading/1.0"
  };
  const token = resolveRelayToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseResponse(resp) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestRelay(userId, path, { method = "GET", query = null, body = null } = {}) {
  const baseUrl = resolveRelayUrl(userId);
  if (!baseUrl) throw new Error("live_trading_not_configured");
  const url = new URL(path, `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());
  try {
    const resp = await fetch(url.toString(), {
      method,
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const parsed = await parseResponse(resp);
    if (!resp.ok) {
      const error = new Error(parsed?.error || `relay_request_failed:${resp.status}`);
      error.status = resp.status;
      error.payload = parsed;
      throw error;
    }
    return parsed || {};
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSide(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "sell" || raw === "short") return "sell";
  return "buy";
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeTrade(trade = {}) {
  const orderType = String(trade.orderType || trade.order_type || trade.type || "market").toLowerCase();
  const limitPrice = toNumber(trade.limitPrice ?? trade.limit_price ?? trade.price ?? trade.entryPrice);
  return {
    symbol: String(trade.symbol || "").trim().toUpperCase(),
    side: normalizeSide(trade.side),
    quantity: toNumber(trade.quantity),
    order_type: orderType,
    limit_price: orderType === "limit" ? limitPrice : null,
    stop_loss: toNumber(trade.stopLoss ?? trade.stop_loss),
    take_profit: toNumber(trade.takeProfit ?? trade.take_profit),
    time_in_force: trade.timeInForce ?? trade.time_in_force ?? null,
    client_order_id: trade.clientOrderId ?? trade.client_order_id ?? null,
    asset_class: trade.assetClass ?? trade.asset_class ?? "crypto",
    metadata: trade.metadata || {}
  };
}

export async function placeLiveOrder({ userId = "local", trade = {}, riskCheckId = "" } = {}) {
  const normalized = normalizeTrade(trade);
  const payload = {
    broker: "coinbase",
    subject: userId,
    requested_by: "aika",
    symbol: normalized.symbol,
    side: normalized.side,
    quantity: normalized.quantity,
    order_type: normalized.order_type,
    limit_price: normalized.limit_price,
    asset_class: normalized.asset_class,
    mode: "live",
    risk_check_id: riskCheckId || "",
    metadata: {
      requestedAt: nowIso(),
      stop_loss: normalized.stop_loss,
      take_profit: normalized.take_profit,
      time_in_force: normalized.time_in_force,
      client_order_id: normalized.client_order_id,
      ...(normalized.metadata || {})
    }
  };
  const proposal = await requestRelay(userId, "trades/propose", { method: "POST", body: payload });
  if (proposal?.decision === "deny") {
    const error = new Error("trade_denied");
    error.detail = proposal;
    throw error;
  }
  const approvalId = proposal?.approval || "";
  const orderId = proposal?.order_id || "";
  if (approvalId && orderId && shouldAutoExecute()) {
    const approval = await requestRelay(userId, `approvals/${encodeURIComponent(approvalId)}/approve`, { method: "POST" });
    const execution = await requestRelay(userId, "trades/execute", {
      method: "POST",
      body: {
        ...payload,
        order_id: orderId,
        approval_id: approvalId
      }
    });
    return {
      mode: "live",
      orderId,
      approvalId,
      proposal,
      approval,
      execution
    };
  }
  return { mode: "live", orderId, approvalId, proposal };
}

export async function modifyLiveOrder({ userId = "local", orderId, updates = {} } = {}) {
  if (!orderId) throw new Error("order_id_required");
  if (!updates || updates.cancel !== true) {
    throw new Error("live_modify_not_supported");
  }
  const payload = {
    broker: "coinbase",
    subject: userId,
    order_id: orderId,
    requested_by: "aika"
  };
  return await requestRelay(userId, "trades/cancel", { method: "POST", body: payload });
}

export async function getLivePositions({ userId = "local" } = {}) {
  const payload = {
    broker: "coinbase",
    subject: userId
  };
  const result = await requestRelay(userId, "trades/positions", { method: "POST", body: payload });
  return result?.positions || result;
}

export async function getLiveAccountState({ userId = "local" } = {}) {
  const payload = {
    broker: "coinbase",
    subject: userId
  };
  const account = await requestRelay(userId, "trades/account", { method: "POST", body: payload });
  if (account && typeof account === "object" && !Number.isFinite(account.openPositions)) {
    try {
      const positions = await getLivePositions({ userId });
      if (Array.isArray(positions)) {
        return { ...account, openPositions: positions.length };
      }
    } catch {
      return account;
    }
  }
  return account;
}
