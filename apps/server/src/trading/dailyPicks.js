import { getRuntimeFlags, setRuntimeFlag } from "../../storage/runtime_flags.js";
import { sendGmailMessage, getGoogleStatus } from "../../integrations/google.js";
import { writeOutbox } from "../../storage/outbox.js";
import { executeAction } from "../safety/executeAction.js";
import { getTradingEmailSettings, getTradingTrainingSettings } from "../../storage/trading_settings.js";

const FLAG_KEY = "trading_daily_picks";

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseTime(value) {
  const raw = String(value || "08:00").trim();
  const [h, m] = raw.split(":");
  return { hour: Math.min(23, Math.max(0, Number(h || 8))), minute: Math.min(59, Math.max(0, Number(m || 0))) };
}

function nextRunAtLocal({ hour, minute }) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return num.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function computeSignal(candles = []) {
  if (!candles.length) return { score: 0, label: "WATCH", reason: "No data" };
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] || last;
  const closes = candles.map(c => c.c);
  const ma = (window) => {
    const slice = closes.slice(Math.max(0, closes.length - window));
    if (!slice.length) return last.c;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };
  const ma7 = ma(7);
  const ma21 = ma(21);
  const mom = (last.c - prev.c) / (prev.c || 1);
  const score = ((last.c - ma21) / (ma21 || 1)) + ((last.c - ma7) / (ma7 || 1)) + mom;
  let label = "WATCH";
  if (score > 0.015) label = "BUY";
  if (score < -0.015) label = "SELL";
  const reason = `Close ${formatNumber(last.c)} vs MA7 ${formatNumber(ma7)} / MA21 ${formatNumber(ma21)}; 1d momentum ${(mom * 100).toFixed(2)}%`;
  return { score, label, reason, last };
}

async function fetchStockCandles(symbol) {
  const stooq = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("stooq_failed");
  const text = await resp.text();
  const lines = text.trim().split(/\r?\n/).slice(1);
  return lines
    .map(line => {
      const [date, open, high, low, close, volume] = line.split(",");
      return {
        t: date ? new Date(date).getTime() : Date.now(),
        o: Number(open),
        h: Number(high),
        l: Number(low),
        c: Number(close),
        v: Number(volume || 0)
      };
    })
    .filter(c => Number.isFinite(c.c));
}

async function fetchCryptoCandles(symbol) {
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles?granularity=86400`;
  const resp = await fetch(url, { headers: { "User-Agent": "AikaTrading/1.0" } });
  if (!resp.ok) throw new Error("coinbase_failed");
  const data = await resp.json();
  return Array.isArray(data)
    ? data.map(row => ({
        t: row[0] * 1000,
        l: row[1],
        h: row[2],
        o: row[3],
        c: row[4],
        v: row[5]
      })).sort((a, b) => a.t - b.t)
    : [];
}

function buildPickEntry({ symbol, assetClass, signal }) {
  const bias = signal.label;
  const confidence = Math.min(0.9, Math.max(0.1, Math.abs(signal.score) * 10));
  const abstract = [
    `${symbol} (${assetClass})`,
    `Bias: ${bias}`,
    `Confidence: ${(confidence * 100).toFixed(0)}%`,
    signal.reason,
    bias === "BUY"
      ? "Trend and momentum align; risk: pullback to MA21."
      : bias === "SELL"
        ? "Momentum weak; risk: rebound above MA7."
        : "Mixed signals; watch for breakout or breakdown."
  ].join(" | ");
  return {
    symbol,
    assetClass,
    bias,
    score: signal.score,
    abstract
  };
}

function formatTrainingPrefs(training) {
  const lines = [];
  const notes = String(training?.notes || "").trim();
  if (notes) {
    lines.push(`Directives: ${notes}`);
  }
  const questions = Array.isArray(training?.questions) ? training.questions : [];
  const answered = questions
    .map(q => ({
      question: String(q?.question || "").trim(),
      answer: String(q?.answer || "").trim()
    }))
    .filter(q => q.question && q.answer);
  if (answered.length) {
    lines.push("Guiding Questions:");
    answered.forEach(item => {
      lines.push(`- ${item.question} ${item.answer}`);
    });
  }
  return lines;
}

function buildEmailBody(picks, generatedAt, training) {
  const lines = [
    "Aika Daily Picks",
    `Generated: ${generatedAt}`,
    "",
    `Total picks: ${picks.length}`,
    "",
    "Abstracts:",
    ...picks.map((p, idx) => `${idx + 1}. ${p.abstract}`),
    ""
  ];
  const trainingLines = formatTrainingPrefs(training);
  if (trainingLines.length) {
    lines.push("Personalization:");
    lines.push(...trainingLines);
    lines.push("");
  }
  lines.push(
    "Disclaimer: Educational only. Not financial advice. Confirm risk, liquidity, and position sizing before trading."
  );
  return lines.join("\n");
}

export async function generateDailyPicks({ emailSettings } = {}) {
  const settings = emailSettings || getTradingEmailSettings("local");
  const stocks = Array.isArray(settings.stocks) ? settings.stocks : [];
  const cryptos = Array.isArray(settings.cryptos) ? settings.cryptos : [];

  const stockResults = [];
  for (const symbol of stocks) {
    try {
      const candles = await fetchStockCandles(symbol);
      const signal = computeSignal(candles);
      stockResults.push(buildPickEntry({ symbol, assetClass: "stock", signal }));
    } catch {
      // skip
    }
  }

  const cryptoResults = [];
  for (const symbol of cryptos) {
    try {
      const candles = await fetchCryptoCandles(symbol);
      const signal = computeSignal(candles);
      cryptoResults.push(buildPickEntry({ symbol, assetClass: "crypto", signal }));
    } catch {
      // skip
    }
  }

  const stockCount = Number(settings.stockCount || 0);
  const cryptoCount = Number(settings.cryptoCount || 0);
  const minPicks = Number(settings.minPicks || 0);
  const maxPicks = Number(settings.maxPicks || 0);

  stockResults.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  cryptoResults.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  let picks = [
    ...stockResults.slice(0, stockCount),
    ...cryptoResults.slice(0, cryptoCount)
  ];

  if (picks.length < minPicks) {
    const remainder = [...stockResults.slice(stockCount), ...cryptoResults.slice(cryptoCount)];
    remainder.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    picks = picks.concat(remainder.slice(0, minPicks - picks.length));
  }

  if (picks.length > maxPicks) picks = picks.slice(0, maxPicks);

  return picks;
}

export async function runDailyPicksEmail({ force = false } = {}) {
  const settings = getTradingEmailSettings("local");
  const enabled = Boolean(settings.enabled);
  if (!enabled && !force) return { ok: false, skipped: true, reason: "disabled" };

  const recipients = Array.isArray(settings.recipients) ? settings.recipients : [];
  if (!recipients.length) return { ok: false, skipped: true, reason: "no_recipients" };

  const flags = getRuntimeFlags();
  const lastSent = flags[FLAG_KEY]?.lastSentDate || "";
  const today = todayKey();
  if (!force && lastSent === today) {
    return { ok: false, skipped: true, reason: "already_sent" };
  }

  const picks = await generateDailyPicks({ emailSettings: settings });
  const subjectPrefix = settings.subjectPrefix || "Aika Daily Picks";
  const subject = `${subjectPrefix} - ${today}`;
  const training = getTradingTrainingSettings("local");
  const body = buildEmailBody(picks, new Date().toLocaleString(), training);

  const fromName = String(process.env.EMAIL_FROM_NAME || "Aika Trading Assistant");
  const allowOutboxFallback = String(process.env.EMAIL_OUTBOX_FALLBACK || "0").toLowerCase() === "1";
  const googleStatus = getGoogleStatus("local");
  const scopes = new Set(Array.isArray(googleStatus?.scopes) ? googleStatus.scopes : []);
  const hasSendScope = scopes.has("https://www.googleapis.com/auth/gmail.send");

  const result = await executeAction({
    actionType: "email.send",
    params: { to: recipients, subject },
    context: { userId: "local" },
    summary: "Send daily trading picks",
    handler: async () => {
      if (!googleStatus?.connected || !hasSendScope) {
        if (!allowOutboxFallback) {
          throw new Error("gmail_send_scope_missing");
        }
        const outbox = writeOutbox({
          type: "daily_trading_picks",
          to: recipients,
          subject,
          text: body,
          reason: "gmail_send_scope_missing"
        });
        return { ok: true, transport: "outbox", outboxId: outbox.id };
      }
      const sent = await sendGmailMessage({
        to: recipients,
        subject,
        text: body,
        fromName,
        userId: "local"
      });
      return { ok: true, transport: "gmail", messageId: sent?.id || null };
    }
  });

  if (result.status === "approval_required") {
    return { ok: false, approval: result.approval, reason: "approval_required" };
  }

  if (result.status === "ok") {
    setRuntimeFlag(FLAG_KEY, { lastSentDate: today, lastSentAt: new Date().toISOString() });
    return { ok: true, picks: picks.length };
  }

  return { ok: false, error: "send_failed" };
}

let dailyTimer = null;
let dailyLoopActive = false;

export function startDailyPicksLoop() {
  if (dailyLoopActive) return;
  dailyLoopActive = true;
  scheduleNext();
}

export function rescheduleDailyPicksLoop() {
  if (dailyTimer) clearTimeout(dailyTimer);
  dailyTimer = null;
  dailyLoopActive = false;
  startDailyPicksLoop();
}

function scheduleNext() {
  const settings = getTradingEmailSettings("local");
  if (!settings.enabled) {
    dailyLoopActive = false;
    return;
  }
  const time = parseTime(settings.time || "08:00");
  const next = nextRunAtLocal(time);
  const delay = Math.max(1000, next.getTime() - Date.now());
  dailyTimer = setTimeout(async () => {
    try {
      await runDailyPicksEmail();
    } catch {
      // ignore
    } finally {
      scheduleNext();
    }
  }, delay);
}
