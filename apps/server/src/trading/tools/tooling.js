import { fetchMarketCandles } from "../marketData.js";
import { strategyEvaluate as evalStrategy } from "./strategyEngine.js";
import { riskCheck as runRiskCheck } from "./riskEngine.js";
import { placePaperOrder, modifyPaperOrder, getPaperPositions, getPaperAccountState } from "./paperEngine.js";
import { placeLiveOrder, modifyLiveOrder, getLivePositions, getLiveAccountState } from "./liveEngine.js";
import { appendTradeLog, appendTradeState, writeLog, writeErrorLog, getTradeLogPaths } from "./tradeLogger.js";
import { sendTelegramMessage, sendSlackMessage, sendDiscordMessage, sendWhatsAppMessage, sendSmsMessage } from "../../../integrations/messaging.js";
import { searchWeb } from "../../../integrations/web_search.js";
import { createAssistantTask } from "../../../storage/assistant_tasks.js";
import { getDb } from "../../../storage/db.js";
import { nowIso } from "../../../storage/utils.js";
import { getTradingLimits } from "./soul.js";

function normalizeSymbols(input) {
  if (Array.isArray(input)) {
    return input.map(item => {
      if (typeof item === "string") return { symbol: item };
      return item || {};
    });
  }
  if (typeof input === "string") {
    return input.split(/[;,\n]/).map(item => ({ symbol: item.trim() })).filter(item => item.symbol);
  }
  return [];
}

function isRecentRiskCheck(row, maxAgeMs = 10 * 60_000) {
  const ts = row?.created_at ? Date.parse(row.created_at) : 0;
  if (!ts) return false;
  return Date.now() - ts <= maxAgeMs;
}

function getRiskCheckById(riskCheckId) {
  if (!riskCheckId) return null;
  const db = getDb();
  return db.prepare("SELECT * FROM trading_risk_checks WHERE id = ?").get(riskCheckId);
}

function parseCron(cronExpression = "") {
  const raw = String(cronExpression || "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*" || dow !== "*") return null;
  if (min.startsWith("*/") && hour === "*") {
    const interval = Number(min.replace("*/", ""));
    if (Number.isFinite(interval) && interval > 0) {
      return { type: "interval", intervalMinutes: Math.floor(interval) };
    }
  }
  if (/^\d{1,2}$/.test(min) && /^\d{1,2}$/.test(hour)) {
    const hh = String(hour).padStart(2, "0");
    const mm = String(min).padStart(2, "0");
    return { type: "daily", timeOfDay: `${hh}:${mm}` };
  }
  return null;
}

function parseBool(value, fallback = false) {
  if (value == null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function isLiveTradingEnabled() {
  return parseBool(process.env.LIVE_TRADING_ENABLED || process.env.TRADING_LIVE_ENABLED, false);
}

function assertLiveAllowed(liveConfirmationToken) {
  if (!isLiveTradingEnabled()) {
    throw new Error("live_trading_disabled");
  }
  const limits = getTradingLimits();
  if (String(liveConfirmationToken || "").trim() !== limits.liveToken) {
    throw new Error("live_confirmation_required");
  }
}

const SECRET_KEYS = new Set([
  "apikey",
  "api_key",
  "secret",
  "secretkey",
  "secret_key",
  "passphrase",
  "privatekey",
  "private_key",
  "accesskey",
  "access_key"
]);

function containsSecrets(value, depth = 0) {
  if (depth > 4 || value == null) return false;
  if (Array.isArray(value)) {
    return value.some(item => containsSecrets(item, depth + 1));
  }
  if (typeof value !== "object") return false;
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEYS.has(String(key || "").toLowerCase())) return true;
    if (containsSecrets(val, depth + 1)) return true;
  }
  return false;
}

function assertNoSecrets(payload) {
  if (containsSecrets(payload)) {
    throw new Error("exchange_credentials_not_allowed");
  }
}

export async function marketSnapshot({ symbols, timeframe = "1h", assetClass = "all", limit = 200, feed = "" } = {}) {
  const items = normalizeSymbols(symbols);
  const results = await Promise.allSettled(items.map(async item => {
    const symbol = String(item.symbol || "").trim().toUpperCase();
    if (!symbol) return null;
    const resolvedClass = String(item.assetClass || item.asset_class || assetClass || "stock").toLowerCase();
    const response = await fetchMarketCandles({
      symbol,
      assetClass: resolvedClass,
      interval: timeframe,
      limit,
      feed
    });
    return {
      symbol,
      assetClass: resolvedClass,
      candles: response.candles || [],
      source: response.source,
      interval: response.interval,
      warning: response.warning,
      error: response.error
    };
  }));

  const payload = results.flatMap(result => (result.status === "fulfilled" && result.value ? [result.value] : []));
  return { symbols: payload, fetchedAt: nowIso() };
}

export async function strategyEvaluate({ snapshot, horizonDays = 180 } = {}) {
  const result = await evalStrategy({ snapshot, horizonDays });
  return { ...result, evaluatedAt: nowIso() };
}

export function riskCheck({ proposedTrade, accountState, mode = "paper", userId = "local" } = {}) {
  return runRiskCheck({ trade: proposedTrade || {}, accountState, mode, userId });
}

export async function placeOrder({ trade, mode = "paper", userId = "local", riskCheckId = "", liveConfirmationToken = "" } = {}) {
  const normalizedMode = String(mode || "paper").toLowerCase();
  assertNoSecrets(trade);
  const riskRow = getRiskCheckById(riskCheckId);
  if (!riskRow || riskRow.decision !== "pass" || !isRecentRiskCheck(riskRow)) {
    throw new Error("risk_check_required");
  }

  if (normalizedMode !== "paper") {
    assertLiveAllowed(liveConfirmationToken);
    try {
      const order = await placeLiveOrder({ userId, trade, riskCheckId });
      appendTradeLog({ type: "order", mode: "live", trade, order });
      appendTradeState({ type: "order", mode: "live", order });
      return { mode: "live", ...order };
    } catch (err) {
      writeErrorLog({ type: "order_error", mode: "live", error: err?.message || err });
      throw err;
    }
  }

  const order = placePaperOrder({ userId, trade, riskCheckId });
  appendTradeLog({ type: "order", mode: "paper", trade, order });
  appendTradeState({ type: "order", mode: "paper", order });
  return { mode: "paper", ...order };
}

export async function modifyOrder({ orderId, updates = {}, mode = "paper", userId = "local", liveConfirmationToken = "" } = {}) {
  const normalizedMode = String(mode || "paper").toLowerCase();
  assertNoSecrets(updates);
  if (normalizedMode !== "paper") {
    assertLiveAllowed(liveConfirmationToken);
    try {
      const result = await modifyLiveOrder({ userId, orderId, updates });
      appendTradeLog({ type: "order_modify", mode: "live", orderId, updates });
      return result;
    } catch (err) {
      writeErrorLog({ type: "order_modify_error", mode: "live", orderId, error: err?.message || err });
      throw err;
    }
  }
  const result = modifyPaperOrder({ userId, orderId, updates });
  appendTradeLog({ type: "order_modify", mode: "paper", orderId, updates });
  return result;
}

export async function getPositions({ mode = "paper", userId = "local" } = {}) {
  const normalizedMode = String(mode || "paper").toLowerCase();
  if (normalizedMode !== "paper") {
    if (!isLiveTradingEnabled()) throw new Error("live_trading_disabled");
    return await getLivePositions({ userId });
  }
  return getPaperPositions(userId);
}

export async function getAccountState({ mode = "paper", userId = "local" } = {}) {
  const normalizedMode = String(mode || "paper").toLowerCase();
  if (normalizedMode !== "paper") {
    if (!isLiveTradingEnabled()) throw new Error("live_trading_disabled");
    return await getLiveAccountState({ userId });
  }
  return getPaperAccountState(userId);
}

export function writeLogEntry(entry = {}) {
  return writeLog(entry);
}

export function appendTradeLogEntry(record = {}) {
  return appendTradeLog(record);
}

export function updateTradeState(state = {}) {
  return appendTradeState(state);
}

export async function notify({ channel, message }) {
  const target = String(channel || "").toLowerCase();
  const text = String(message || "");
  if (!text) throw new Error("message_required");
  if (target === "telegram") {
    const chatId = process.env.TELEGRAM_CHAT_ID || "";
    if (!chatId) throw new Error("telegram_chat_id_missing");
    return await sendTelegramMessage(chatId, text);
  }
  if (target === "slack") {
    const slackChannel = process.env.SLACK_CHANNELS?.split(/[;,]/).map(c => c.trim()).filter(Boolean)[0] || "";
    if (!slackChannel) throw new Error("slack_channel_missing");
    return await sendSlackMessage(slackChannel, text);
  }
  if (target === "discord") {
    return await sendDiscordMessage(text);
  }
  if (target === "whatsapp") {
    const to = process.env.WHATSAPP_TO || "";
    if (!to) throw new Error("whatsapp_to_missing");
    return await sendWhatsAppMessage(to, text);
  }
  if (target === "sms") {
    const to = process.env.TWILIO_SMS_TO || "";
    if (!to) throw new Error("sms_to_missing");
    return await sendSmsMessage(to, text);
  }
  throw new Error("notify_channel_unsupported");
}

export async function healthCheck() {
  const db = getDb();
  db.prepare("SELECT 1 AS ok").get();
  return {
    ok: true,
    ts: nowIso(),
    db: "ok",
    tradeLogs: getTradeLogPaths()
  };
}

export async function searchWebTool({ query, limit = 5 } = {}) {
  return await searchWeb(query, limit);
}

export function schedulerRegister({ cronExpression, taskMessage, ownerId = "local" } = {}) {
  const schedule = parseCron(cronExpression || "");
  if (!schedule) throw new Error("cron_not_supported");
  return createAssistantTask(ownerId, {
    title: `Scheduled: ${taskMessage || "task"}`,
    prompt: String(taskMessage || "").trim() || "Scheduled task",
    schedule,
    status: "active",
    notificationChannels: ["in_app"]
  });
}

export function toolContract() {
  return {
    "tool.market_snapshot": marketSnapshot,
    "tool.strategy_evaluate": strategyEvaluate,
    "tool.risk_check": riskCheck,
    "tool.place_order": placeOrder,
    "tool.modify_order": modifyOrder,
    "tool.get_positions": getPositions,
    "tool.get_account_state": getAccountState,
    "tool.write_log": writeLogEntry,
    "tool.append_trade_log": appendTradeLogEntry,
    "tool.update_trade_state": updateTradeState,
    "tool.notify": notify,
    "tool.health_check": healthCheck,
    "tool.search_web": searchWebTool,
    "tool.scheduler_register": schedulerRegister
  };
}
