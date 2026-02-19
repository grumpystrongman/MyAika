const MARKET_DATA_TIMEOUT_MS = Number(process.env.TRADING_MARKET_DATA_FETCH_TIMEOUT_MS || 15000);

function fetchWithTimeout(url, options = {}, timeoutMs = MARKET_DATA_TIMEOUT_MS) {
  if (!timeoutMs || timeoutMs <= 0) return fetch(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function normalizeInterval(value) {
  const input = String(value || "").toLowerCase();
  if (["1m", "5m", "15m", "1h", "1d"].includes(input)) return input;
  return "1h";
}

function mapCoinbaseGranularity(interval) {
  const lookup = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "1d": 86400
  };
  return lookup[interval] || 3600;
}

function mapAlpacaTimeframe(interval) {
  const lookup = {
    "1m": "1Min",
    "5m": "5Min",
    "15m": "15Min",
    "1h": "1Hour",
    "1d": "1Day"
  };
  return lookup[interval] || "1Hour";
}

function getAlpacaCreds() {
  const key = process.env.ALPACA_DATA_KEY || process.env.ALPACA_API_KEY || "";
  const secret = process.env.ALPACA_DATA_SECRET || process.env.ALPACA_API_SECRET || "";
  return { key, secret };
}

function parseNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sortCandles(list = []) {
  return [...list].sort((a, b) => a.t - b.t);
}

async function fetchCoinbaseCandles(symbol, interval, limit) {
  const granularity = mapCoinbaseGranularity(interval);
  const maxPoints = Math.min(300, Math.max(20, Number(limit || 200)));
  const end = Math.floor(Date.now() / 1000);
  const start = end - granularity * maxPoints;
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles?granularity=${granularity}&start=${start}&end=${end}`;
  const resp = await fetchWithTimeout(url, { headers: { "User-Agent": "AikaTrading/1.0" } });
  if (!resp.ok) throw new Error("coinbase_candles_failed");
  const data = await resp.json();
  const candles = Array.isArray(data)
    ? data.map(row => ({
        t: row[0] * 1000,
        l: parseNumber(row[1]),
        h: parseNumber(row[2]),
        o: parseNumber(row[3]),
        c: parseNumber(row[4]),
        v: parseNumber(row[5], 0)
      })).filter(c => Number.isFinite(c.c))
    : [];
  return sortCandles(candles);
}

async function fetchStooqDaily(symbol) {
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error("stooq_failed");
  const text = await resp.text();
  if (/exceeded the daily hits limit/i.test(text)) {
    throw new Error("stooq_rate_limited");
  }
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length <= 1) throw new Error("stooq_empty");
  const candles = lines.slice(1).map(line => {
    const [date, open, high, low, close, volume] = line.split(",");
    const ts = date ? new Date(date).getTime() : Date.now();
    return {
      t: ts,
      o: parseNumber(open),
      h: parseNumber(high),
      l: parseNumber(low),
      c: parseNumber(close),
      v: parseNumber(volume, 0)
    };
  }).filter(c => Number.isFinite(c.c));
  return sortCandles(candles);
}

async function fetchYahooDaily(symbol, windowDays = 365) {
  const rangeDays = Math.max(30, Math.min(730, Number(windowDays || 120)));
  const range = rangeDays >= 365 ? "1y" : `${rangeDays}d`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=div%7Csplit`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) throw new Error("yahoo_failed");
  const data = await resp.json().catch(() => ({}));
  const result = data?.chart?.result?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const opens = Array.isArray(quote.open) ? quote.open : [];
  const highs = Array.isArray(quote.high) ? quote.high : [];
  const lows = Array.isArray(quote.low) ? quote.low : [];
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const volumes = Array.isArray(quote.volume) ? quote.volume : [];
  const candles = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const c = closes[i];
    if (!Number.isFinite(c)) continue;
    candles.push({
      t: timestamps[i] * 1000,
      o: parseNumber(opens[i]),
      h: parseNumber(highs[i]),
      l: parseNumber(lows[i]),
      c,
      v: parseNumber(volumes[i], 0)
    });
  }
  return sortCandles(candles);
}

async function fetchAlpacaBars(symbol, interval, limit, feed) {
  const { key, secret } = getAlpacaCreds();
  if (!key || !secret) throw new Error("alpaca_credentials_missing");
  const timeframe = mapAlpacaTimeframe(interval);
  const safeLimit = Math.min(1000, Math.max(50, Number(limit || 200)));
  const feedParam = feed || process.env.ALPACA_DATA_FEED || "iex";
  const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${encodeURIComponent(timeframe)}&limit=${safeLimit}&feed=${encodeURIComponent(feedParam)}`;
  const resp = await fetchWithTimeout(url, {
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret
    }
  });
  if (!resp.ok) throw new Error("alpaca_data_failed");
  const data = await resp.json().catch(() => ({}));
  const candles = Array.isArray(data?.bars)
    ? data.bars.map(row => ({
        t: new Date(row.t).getTime(),
        o: parseNumber(row.o),
        h: parseNumber(row.h),
        l: parseNumber(row.l),
        c: parseNumber(row.c),
        v: parseNumber(row.v, 0)
      })).filter(c => Number.isFinite(c.c))
    : [];
  return { candles: sortCandles(candles), source: `alpaca-${feedParam}` };
}

export async function fetchMarketCandles({
  symbol,
  assetClass = "stock",
  interval = "1h",
  limit = 200,
  feed = ""
} = {}) {
  const normalizedInterval = normalizeInterval(interval);
  const asset = String(assetClass || "stock").toLowerCase();
  const targetSymbol = String(symbol || "").trim();
  if (!targetSymbol) return { candles: [], source: "unavailable", interval: normalizedInterval, error: "symbol_required" };

  if (asset === "crypto") {
    try {
      const candles = await fetchCoinbaseCandles(targetSymbol, normalizedInterval, limit);
      return { candles, source: "coinbase", interval: normalizedInterval };
    } catch (err) {
      return {
        candles: [],
        source: "coinbase",
        interval: normalizedInterval,
        error: err?.message || "coinbase_candles_failed"
      };
    }
  }

  try {
    const result = await fetchAlpacaBars(targetSymbol, normalizedInterval, limit, feed);
    if (result.candles.length) {
      return { candles: result.candles, source: result.source, interval: normalizedInterval };
    }
  } catch (err) {
    const warning = normalizedInterval === "1d"
      ? ""
      : "Intraday stock candles need Alpaca keys. Showing daily bars.";
    try {
      const stooq = await fetchStooqDaily(targetSymbol);
      if (stooq.length) {
        return {
          candles: stooq,
          source: "stooq",
          interval: "1d",
          warning
        };
      }
    } catch {
      // fall through
    }
    try {
      const yahoo = await fetchYahooDaily(targetSymbol, 365);
      if (yahoo.length) {
        return {
          candles: yahoo,
          source: "yahoo",
          interval: "1d",
          warning
        };
      }
    } catch {
      // ignore
    }
    return {
      candles: [],
      source: "alpaca",
      interval: normalizedInterval,
      error: err?.message || "alpaca_data_failed"
    };
  }

  return { candles: [], source: "alpaca", interval: normalizedInterval, error: "no_candles" };
}
