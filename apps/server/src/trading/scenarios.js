import { createScenarioRun, listScenarioRuns } from "../../storage/trading_scenarios.js";
import { getTradingEmailSettings } from "../../storage/trading_settings.js";
import { generateDailyPicks } from "./dailyPicks.js";

function mapGranularity(interval) {
  const lookup = {
    "1d": 86400
  };
  return lookup[interval] || 86400;
}

function mapAlpacaTimeframe(interval) {
  const lookup = {
    "1d": "1Day"
  };
  return lookup[interval] || "1Day";
}

function getAlpacaCreds() {
  const key = process.env.ALPACA_DATA_KEY || process.env.ALPACA_API_KEY || "";
  const secret = process.env.ALPACA_DATA_SECRET || process.env.ALPACA_API_SECRET || "";
  return { key, secret };
}

async function fetchCryptoCandles(symbol, windowDays) {
  const granularity = mapGranularity("1d");
  const end = Math.floor(Date.now() / 1000);
  const start = end - windowDays * 86400;
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles?granularity=${granularity}&start=${start}&end=${end}`;
  const resp = await fetch(url, { headers: { "User-Agent": "AikaTrading/1.0" } });
  if (!resp.ok) throw new Error("coinbase_candles_failed");
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

async function fetchStockCandles(symbol, windowDays) {
  const { key, secret } = getAlpacaCreds();
  if (key && secret) {
    const timeframe = mapAlpacaTimeframe("1d");
    const limit = Math.min(300, Math.max(30, windowDays + 5));
    const feed = process.env.ALPACA_DATA_FEED || "iex";
    const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}&feed=${encodeURIComponent(feed)}`;
    const resp = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret
      }
    });
    if (!resp.ok) throw new Error("alpaca_data_failed");
    const data = await resp.json().catch(() => ({}));
    return Array.isArray(data?.bars)
      ? data.bars.map(row => ({
          t: new Date(row.t).getTime(),
          o: row.o,
          h: row.h,
          l: row.l,
          c: row.c,
          v: row.v
        }))
      : [];
  }

  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("stooq_failed");
  const text = await resp.text();
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  return lines.slice(1).map(line => {
    const [date, open, high, low, close, volume] = line.split(",");
    const ts = date ? new Date(date).getTime() : Date.now();
    return {
      t: ts,
      o: Number(open),
      h: Number(high),
      l: Number(low),
      c: Number(close),
      v: Number(volume || 0)
    };
  }).filter(c => Number.isFinite(c.c));
}

function computeScenarioResult(candles, windowDays) {
  if (!candles?.length) return null;
  const sorted = [...candles].sort((a, b) => a.t - b.t);
  const recent = sorted.slice(-windowDays);
  if (!recent.length) return null;
  const start = recent[0].c;
  const end = recent[recent.length - 1].c;
  const change = end - start;
  const returnPct = start ? (change / start) * 100 : 0;
  return {
    start,
    end,
    returnPct: Number(returnPct.toFixed(2)),
    points: recent.length
  };
}

export async function runTradingScenario({ assetClass = "all", windowDays = 30, picks = [], useDailyPicks = false } = {}) {
  const settings = getTradingEmailSettings("local");
  const defaultStocks = Array.isArray(settings?.stocks) ? settings.stocks : [];
  const defaultCryptos = Array.isArray(settings?.cryptos) ? settings.cryptos : [];
  let watchlist = Array.isArray(picks) && picks.length
    ? picks
    : assetClass === "stock"
      ? defaultStocks
      : assetClass === "crypto"
        ? defaultCryptos
        : [...defaultStocks, ...defaultCryptos];

  if (!watchlist.length || useDailyPicks) {
    const daily = await generateDailyPicks({ emailSettings: settings }).catch(() => []);
    watchlist = Array.isArray(daily) ? daily.map(p => p.symbol).filter(Boolean) : [];
  }

  const results = [];
  for (const symbol of watchlist) {
    const isCrypto = symbol.includes("-") || symbol.endsWith("-USD");
    const resolvedClass = assetClass === "all" ? (isCrypto ? "crypto" : "stock") : assetClass;
    try {
      const candles = resolvedClass === "crypto"
        ? await fetchCryptoCandles(symbol, windowDays)
        : await fetchStockCandles(symbol, windowDays);
      const metrics = computeScenarioResult(candles, windowDays);
      if (!metrics) throw new Error("no_candles");
      results.push({
        symbol,
        assetClass: resolvedClass,
        windowDays,
        ...metrics
      });
    } catch (err) {
      results.push({
        symbol,
        assetClass: resolvedClass,
        windowDays,
        error: err?.message || "scenario_failed"
      });
    }
  }

  const run = createScenarioRun({
    assetClass,
    windowDays,
    picks: watchlist,
    results
  });
  return { runId: run.id, runAt: run.runAt, results };
}

export function listTradingScenarios({ limit = 10 } = {}) {
  return listScenarioRuns({ limit });
}
