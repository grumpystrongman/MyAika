import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

const DEFAULT_STOCKS = [
  "SPY",
  "QQQ",
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "JPM",
  "V",
  "UNH",
  "XOM",
  "COST",
  "AMD"
];

const DEFAULT_CRYPTOS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "ADA-USD",
  "XRP-USD",
  "AVAX-USD",
  "LINK-USD"
];

const DEFAULT_TRAINING_QUESTIONS = [
  "What is my risk tolerance (low / medium / high)?",
  "What is my typical holding period?",
  "What max drawdown am I willing to accept?",
  "Do I prefer ETFs/blue chips or higher-growth names?",
  "Any sectors or themes to prioritize or avoid?",
  "Do I allow leverage/options, or spot only?"
];

function parseList(value, fallback = []) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.split(/[;,\n]/).map(v => v.trim()).filter(Boolean);
}

function parseBool(value, fallback = false) {
  if (value == null) return fallback;
  const str = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(str)) return true;
  if (["0", "false", "no", "off"].includes(str)) return false;
  return fallback;
}

function parseIntSafe(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function defaultEmailSettings() {
  return {
    enabled: parseBool(process.env.TRADING_DAILY_EMAIL_ENABLED, false),
    time: String(process.env.TRADING_DAILY_EMAIL_TIME || "08:00"),
    recipients: parseList(process.env.TRADING_DAILY_EMAIL_RECIPIENTS, []),
    subjectPrefix: String(process.env.TRADING_DAILY_EMAIL_SUBJECT_PREFIX || "Aika Daily Picks"),
    minPicks: parseIntSafe(process.env.TRADING_DAILY_EMAIL_MIN_PICKS, 10),
    maxPicks: parseIntSafe(process.env.TRADING_DAILY_EMAIL_MAX_PICKS, 15),
    stockCount: parseIntSafe(process.env.TRADING_DAILY_EMAIL_STOCK_COUNT, 8),
    cryptoCount: parseIntSafe(process.env.TRADING_DAILY_EMAIL_CRYPTO_COUNT, 4),
    stocks: parseList(process.env.TRADING_DAILY_STOCKS, DEFAULT_STOCKS),
    cryptos: parseList(process.env.TRADING_DAILY_CRYPTOS, DEFAULT_CRYPTOS)
  };
}

function defaultTrainingSettings() {
  return {
    notes: "",
    questions: DEFAULT_TRAINING_QUESTIONS.map(question => ({
      id: crypto.randomUUID(),
      question,
      answer: ""
    }))
  };
}

function defaultEngineSettings() {
  return {
    tradeApiUrl: String(process.env.TRADING_API_URL || "http://localhost:8088"),
    alpacaFeed: String(process.env.ALPACA_FEED || "iex")
  };
}

function applyOverrides(defaults, overrides) {
  const output = { ...defaults };
  if (!overrides || typeof overrides !== "object") return output;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    output[key] = value;
  }
  return output;
}

function sanitizeEmailSettings(input, fallback) {
  const base = { ...fallback };
  if (!input || typeof input !== "object") return base;
  if (Object.prototype.hasOwnProperty.call(input, "enabled")) {
    base.enabled = Boolean(input.enabled);
  }
  if (input.time && typeof input.time === "string") {
    base.time = input.time.trim() || base.time;
  }
  if (Object.prototype.hasOwnProperty.call(input, "recipients")) {
    const recipients = Array.isArray(input.recipients)
      ? input.recipients
      : parseList(input.recipients, []);
    base.recipients = recipients.map(r => String(r || "").trim()).filter(Boolean);
  }
  if (typeof input.subjectPrefix === "string") {
    base.subjectPrefix = input.subjectPrefix.trim() || base.subjectPrefix;
  }
  if (Object.prototype.hasOwnProperty.call(input, "minPicks")) {
    base.minPicks = parseIntSafe(input.minPicks, base.minPicks);
  }
  if (Object.prototype.hasOwnProperty.call(input, "maxPicks")) {
    base.maxPicks = parseIntSafe(input.maxPicks, base.maxPicks);
  }
  if (Object.prototype.hasOwnProperty.call(input, "stockCount")) {
    base.stockCount = parseIntSafe(input.stockCount, base.stockCount);
  }
  if (Object.prototype.hasOwnProperty.call(input, "cryptoCount")) {
    base.cryptoCount = parseIntSafe(input.cryptoCount, base.cryptoCount);
  }
  if (Object.prototype.hasOwnProperty.call(input, "stocks")) {
    base.stocks = Array.isArray(input.stocks)
      ? input.stocks.map(s => String(s || "").trim()).filter(Boolean)
      : parseList(input.stocks, base.stocks);
  }
  if (Object.prototype.hasOwnProperty.call(input, "cryptos")) {
    base.cryptos = Array.isArray(input.cryptos)
      ? input.cryptos.map(s => String(s || "").trim()).filter(Boolean)
      : parseList(input.cryptos, base.cryptos);
  }
  if (base.maxPicks < base.minPicks) base.maxPicks = base.minPicks;
  return base;
}

function sanitizeTrainingSettings(input, fallback) {
  const base = { ...fallback };
  if (!input || typeof input !== "object") return base;
  if (typeof input.notes === "string") {
    base.notes = input.notes.trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, "questions")) {
    const list = Array.isArray(input.questions) ? input.questions : [];
    const cleaned = list
      .map(item => ({
        id: item?.id || crypto.randomUUID(),
        question: String(item?.question || "").trim(),
        answer: String(item?.answer || "").trim()
      }))
      .filter(item => item.question.length > 0);
    base.questions = cleaned;
  }
  return base;
}

function sanitizeEngineSettings(input, fallback) {
  const base = { ...fallback };
  if (!input || typeof input !== "object") return base;
  const url = input.tradeApiUrl || input.trade_api_url;
  if (typeof url === "string") {
    base.tradeApiUrl = url.trim() || base.tradeApiUrl;
  }
  const feed = String(input.alpacaFeed || input.alpaca_feed || "").trim().toLowerCase();
  if (feed === "iex" || feed === "sip") {
    base.alpacaFeed = feed;
  }
  return base;
}

export function getTradingSettings(userId = "local") {
  const db = getDb();
  const row = db.prepare("SELECT * FROM trading_settings WHERE id = ?").get(userId);
  const defaults = {
    email: defaultEmailSettings(),
    training: defaultTrainingSettings(),
    engine: defaultEngineSettings()
  };
  if (!row) {
    return {
      id: userId,
      email: defaults.email,
      training: defaults.training,
      engine: defaults.engine,
      createdAt: null,
      updatedAt: null
    };
  }
  const emailStored = safeJsonParse(row.email_json, {});
  const trainingStored = safeJsonParse(row.training_json, {});
  const engineStored = safeJsonParse(row.engine_json, {});
  return {
    id: userId,
    email: sanitizeEmailSettings(emailStored, defaults.email),
    training: sanitizeTrainingSettings(trainingStored, defaults.training),
    engine: sanitizeEngineSettings(engineStored, defaults.engine),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function updateTradingSettings(userId = "local", patch = {}) {
  const db = getDb();
  const current = getTradingSettings(userId);
  const email = sanitizeEmailSettings(
    applyOverrides(current.email, patch.email),
    current.email
  );
  const training = sanitizeTrainingSettings(
    applyOverrides(current.training, patch.training),
    current.training
  );
  const engine = sanitizeEngineSettings(
    applyOverrides(current.engine, patch.engine),
    current.engine
  );
  const now = nowIso();
  const createdAt = current.createdAt || now;
  db.prepare(
    `INSERT INTO trading_settings (id, email_json, training_json, engine_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email_json = excluded.email_json,
       training_json = excluded.training_json,
       engine_json = excluded.engine_json,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    JSON.stringify(email),
    JSON.stringify(training),
    JSON.stringify(engine),
    createdAt,
    now
  );
  return {
    id: userId,
    email,
    training,
    engine,
    createdAt,
    updatedAt: now
  };
}

export function getTradingEmailSettings(userId = "local") {
  return getTradingSettings(userId).email;
}

export function getTradingTrainingSettings(userId = "local") {
  return getTradingSettings(userId).training;
}

export function getDefaultTradingUniverse() {
  const defaults = defaultEmailSettings();
  return {
    stocks: Array.isArray(defaults.stocks) ? defaults.stocks : [],
    cryptos: Array.isArray(defaults.cryptos) ? defaults.cryptos : []
  };
}
