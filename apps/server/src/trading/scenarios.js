import { createScenarioRun, listScenarioRuns } from "../../storage/trading_scenarios.js";
import { getTradingEmailSettings } from "../../storage/trading_settings.js";
import { generateDailyPicks } from "./dailyPicks.js";

const MARKET_DATA_TIMEOUT_MS = Number(process.env.TRADING_MARKET_DATA_FETCH_TIMEOUT_MS || 15000);

function fetchWithTimeout(url, options = {}, timeoutMs = MARKET_DATA_TIMEOUT_MS) {
  if (!timeoutMs || timeoutMs <= 0) return fetch(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

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

async function fetchYahooCandles(symbol, windowDays) {
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
      o: opens[i],
      h: highs[i],
      l: lows[i],
      c,
      v: Number.isFinite(volumes[i]) ? volumes[i] : 0
    });
  }
  return candles;
}

async function fetchStooqCandles(symbol) {
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

async function fetchCryptoCandles(symbol, windowDays) {
  const granularity = mapGranularity("1d");
  const end = Math.floor(Date.now() / 1000);
  const start = end - windowDays * 86400;
  const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles?granularity=${granularity}&start=${start}&end=${end}`;
  const resp = await fetchWithTimeout(url, { headers: { "User-Agent": "AikaTrading/1.0" } });
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
    const resp = await fetchWithTimeout(url, {
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

  try {
    const stooq = await fetchStooqCandles(symbol);
    if (stooq.length) return stooq;
  } catch {
    // fall through to Yahoo
  }

  const yahoo = await fetchYahooCandles(symbol, windowDays).catch(() => []);
  if (yahoo.length) return yahoo;
  return [];
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

function computeReturns(candles) {
  const closes = candles.map(c => c.c).filter(v => Number.isFinite(v));
  const returns = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const current = closes[i];
    if (!prev) continue;
    returns.push((current - prev) / prev);
  }
  return returns;
}

function mean(values) {
  if (!values?.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

function stddev(values) {
  if (!values?.length) return null;
  const avg = mean(values);
  if (avg == null) return null;
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function simpleMovingAverage(values, period) {
  if (!values?.length || values.length < period) return null;
  const slice = values.slice(-period);
  const avg = mean(slice);
  return avg == null ? null : avg;
}

function computeRSI(values, period = 14) {
  if (!values?.length || values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  let rsi = 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      rsi = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

function computeAtr(candles, period = 14) {
  if (!candles?.length || candles.length <= period) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const prevClose = candles[i - 1].c;
    const high = candles[i].h;
    const low = candles[i].l;
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose)) continue;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  const slice = trs.slice(-period);
  return mean(slice);
}

function computeWinStats(returns) {
  if (!returns?.length) return { upDays: 0, downDays: 0, flatDays: 0, winRate: null, avgUp: null, avgDown: null };
  const up = returns.filter(r => r > 0);
  const down = returns.filter(r => r < 0);
  const flat = returns.length - up.length - down.length;
  return {
    upDays: up.length,
    downDays: down.length,
    flatDays: flat,
    winRate: returns.length ? up.length / returns.length : null,
    avgUp: up.length ? mean(up) * 100 : null,
    avgDown: down.length ? mean(down) * 100 : null
  };
}

function computeTrendStrength(values) {
  if (!values?.length) return null;
  const n = values.length;
  if (n < 3) return null;
  const meanX = (n - 1) / 2;
  const meanY = mean(values);
  if (meanY == null) return null;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    const dy = values[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (!denX || !denY) return null;
  const r = num / Math.sqrt(denX * denY);
  return r * r;
}

function computeMaxDrawdown(values) {
  if (!values?.length) return null;
  let peak = values[0];
  let maxDrawdown = 0;
  values.forEach(value => {
    if (value > peak) peak = value;
    const drawdown = peak ? (value - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  });
  return maxDrawdown;
}

function computeSlope(values) {
  if (!values?.length) return null;
  const n = values.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = mean(values);
  if (meanY == null) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = values[i] - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  if (!den) return null;
  return num / den;
}

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function buildScenarioNarrative({
  symbol,
  assetClass,
  windowDays,
  points,
  startDate,
  endDate,
  startPrice,
  endPrice,
  returnPct,
  rangeHigh,
  rangeLow,
  rangePct,
  positionPct,
  rsi14,
  ma10,
  ma20,
  ma50,
  ma200,
  momentum5,
  momentum10,
  momentum20,
  dailyVol,
  annualVol,
  avgDailyReturn,
  annualReturn,
  sharpe,
  maxDrawdownPct,
  bestDayPct,
  worstDayPct,
  trendSlopePct,
  trendLabel,
  trendStrengthPct,
  regime,
  avgVolume,
  recentVolume,
  lastVolume,
  volumeChangePct,
  support,
  resistance,
  atr14,
  atrPct,
  volShort,
  volLong,
  volRegime,
  winRate,
  upDays,
  downDays,
  avgUp,
  avgDown,
  maAlignment,
  breakoutLabel,
  warnings
} = {}) {
  const lines = [];
  lines.push(`Scenario detail for ${symbol} (${assetClass}) over the last ${windowDays} days.`);
  lines.push(`Data coverage: ${points} daily bars from ${startDate || "unknown"} to ${endDate || "unknown"}.`);

  if (startPrice != null && endPrice != null && returnPct != null) {
    lines.push(`Price moved from ${startPrice} to ${endPrice}, a ${returnPct}% return over the window.`);
  }

  const structureParts = [];
  if (rangeHigh != null && rangeLow != null && rangePct != null) {
    structureParts.push(`Range: ${rangeLow} to ${rangeHigh} (${rangePct}% span).`);
  }
  if (positionPct != null) {
    structureParts.push(`Latest close sits about ${positionPct}% into that range.`);
  }
  if (support != null && resistance != null) {
    structureParts.push(`Support near ${support}; resistance near ${resistance}.`);
  }
  if (breakoutLabel) {
    structureParts.push(breakoutLabel);
  }
  if (structureParts.length) {
    lines.push(`Structure: ${structureParts.join(" ")}`);
  }

  const trendParts = [];
  if (trendLabel) {
    trendParts.push(`Trend signal: ${trendLabel}`);
  }
  if (trendSlopePct != null) {
    trendParts.push(`Slope about ${trendSlopePct}% per day.`);
  }
  if (trendStrengthPct != null) {
    trendParts.push(`Trend strength (R^2): ${trendStrengthPct}%.`);
  }
  if (maAlignment) {
    trendParts.push(maAlignment);
  }
  if (ma10 != null || ma20 != null || ma50 != null || ma200 != null) {
    trendParts.push(`MAs: 10d ${ma10 ?? "n/a"}, 20d ${ma20 ?? "n/a"}, 50d ${ma50 ?? "n/a"}, 200d ${ma200 ?? "n/a"}.`);
  }
  if (trendParts.length) {
    lines.push(`Trend & structure: ${trendParts.join(" ")}`);
  }

  const momentumParts = [];
  if (momentum5 != null || momentum10 != null || momentum20 != null) {
    momentumParts.push(`Momentum: 5d ${momentum5 ?? "n/a"}%, 10d ${momentum10 ?? "n/a"}%, 20d ${momentum20 ?? "n/a"}%.`);
  }
  if (rsi14 != null) {
    momentumParts.push(`RSI(14): ${rsi14}.`);
  }
  if (winRate != null) {
    momentumParts.push(`Up days: ${upDays || 0}, down days: ${downDays || 0} (win rate ${winRate}%).`);
  }
  if (avgUp != null || avgDown != null) {
    momentumParts.push(`Avg up day ${avgUp ?? "n/a"}%, avg down day ${avgDown ?? "n/a"}%.`);
  }
  if (momentumParts.length) {
    lines.push(`Momentum & tape: ${momentumParts.join(" ")}`);
  }

  const riskParts = [];
  if (dailyVol != null || annualVol != null) {
    riskParts.push(`Daily vol ${dailyVol ?? "n/a"}%, annualized vol ${annualVol ?? "n/a"}%.`);
  }
  if (volShort != null || volLong != null) {
    riskParts.push(`Recent vol (10d ${volShort ?? "n/a"}%, 30d ${volLong ?? "n/a"}%).`);
  }
  if (volRegime) {
    riskParts.push(volRegime);
  }
  if (atr14 != null) {
    riskParts.push(`ATR(14) ${atr14}${atrPct != null ? ` (~${atrPct}% of price)` : ""}.`);
  }
  if (maxDrawdownPct != null || bestDayPct != null || worstDayPct != null) {
    riskParts.push(`Max drawdown ${maxDrawdownPct ?? "n/a"}%. Best day ${bestDayPct ?? "n/a"}%, worst day ${worstDayPct ?? "n/a"}%.`);
  }
  if (riskParts.length) {
    lines.push(`Risk & volatility: ${riskParts.join(" ")}`);
  }

  if (avgDailyReturn != null || annualReturn != null || sharpe != null) {
    lines.push(`Return efficiency: average daily return ${avgDailyReturn ?? "n/a"}%, annualized return ${annualReturn ?? "n/a"}%, Sharpe (0% rf) ${sharpe ?? "n/a"}.`);
  }

  if (avgVolume != null || lastVolume != null) {
    lines.push(`Liquidity: average volume ${avgVolume ?? "n/a"}, recent average ${recentVolume ?? "n/a"}, latest ${lastVolume ?? "n/a"} (${volumeChangePct ?? "n/a"}% vs avg).`);
  }

  if (regime) {
    lines.push(`Regime read: ${regime}.`);
  }

  const tactical = [];
  if (trendLabel && trendLabel.toLowerCase().includes("uptrend") && rsi14 != null && rsi14 > 70) {
    tactical.push("Uptrend but RSI is elevated; consider pullback entries rather than chasing.");
  }
  if (trendLabel && trendLabel.toLowerCase().includes("downtrend") && rsi14 != null && rsi14 < 30) {
    tactical.push("Downtrend with oversold RSI; watch for short-covering rallies before adding risk.");
  }
  if (positionPct != null && positionPct > 80) {
    tactical.push("Price is near the top of the recent range; breakout confirmation matters.");
  }
  if (positionPct != null && positionPct < 20) {
    tactical.push("Price is near the bottom of the recent range; breakdown risk is elevated.");
  }
  if (volRegime && volRegime.toLowerCase().includes("rising")) {
    tactical.push("Volatility is rising; reduce size or widen stops.");
  }
  if (maAlignment && maAlignment.toLowerCase().includes("bullish")) {
    tactical.push("MA stack is bullish; trend-follow setups are favored.");
  }
  if (maAlignment && maAlignment.toLowerCase().includes("bearish")) {
    tactical.push("MA stack is bearish; rallies are likely to be sold.");
  }
  if (tactical.length) {
    lines.push(`Tactical notes: ${tactical.join(" ")}`);
  }

  if (warnings?.length) {
    lines.push(`Data warnings: ${warnings.join("; ")}.`);
  }
  return lines.join("\n\n");
}

export async function getScenarioDetail({ symbol, assetClass = "stock", windowDays = 30, includeCandles = false } = {}) {
  const resolvedSymbol = String(symbol || "").trim();
  if (!resolvedSymbol) throw new Error("symbol_required");
  const resolvedClass = String(assetClass || "stock").toLowerCase();
  const window = Number(windowDays || 30);
  const isCrypto = resolvedClass === "crypto" || resolvedSymbol.includes("-") || resolvedSymbol.endsWith("-USD");
  const creds = getAlpacaCreds();
  const provider = isCrypto ? "coinbase" : (creds.key && creds.secret ? "alpaca" : "stooq");

  const candles = isCrypto
    ? await fetchCryptoCandles(resolvedSymbol, window)
    : await fetchStockCandles(resolvedSymbol, window);
  if (!candles?.length) {
    return {
      symbol: resolvedSymbol,
      assetClass: resolvedClass,
      windowDays: window,
      provider,
      error: "no_candles"
    };
  }

  const sorted = [...candles].sort((a, b) => a.t - b.t);
  const closes = sorted.map(c => c.c);
  const highs = sorted.map(c => c.h).filter(v => Number.isFinite(v));
  const lows = sorted.map(c => c.l).filter(v => Number.isFinite(v));
  const volumes = sorted.map(c => c.v).filter(v => Number.isFinite(v));

  const points = sorted.length;
  const startPrice = sorted[0].c;
  const endPrice = sorted[points - 1].c;
  const startDate = sorted[0].t ? new Date(sorted[0].t).toISOString().slice(0, 10) : "";
  const endDate = sorted[points - 1].t ? new Date(sorted[points - 1].t).toISOString().slice(0, 10) : "";
  const returnPct = startPrice ? formatNumber(((endPrice - startPrice) / startPrice) * 100, 2) : null;

  const rangeHigh = highs.length ? Math.max(...highs) : null;
  const rangeLow = lows.length ? Math.min(...lows) : null;
  const rangePct = rangeHigh && rangeLow && rangeLow !== 0
    ? formatNumber(((rangeHigh - rangeLow) / rangeLow) * 100, 2)
    : null;
  const positionPct = rangeHigh && rangeLow && rangeHigh !== rangeLow
    ? formatNumber(((endPrice - rangeLow) / (rangeHigh - rangeLow)) * 100, 1)
    : null;

  const returns = computeReturns(sorted);
  const avgDailyReturn = returns.length ? formatNumber(mean(returns) * 100, 3) : null;
  const dailyVol = returns.length ? formatNumber(stddev(returns) * 100, 3) : null;
  const annualFactor = isCrypto ? 365 : 252;
  const annualVol = returns.length ? formatNumber((stddev(returns) || 0) * Math.sqrt(annualFactor) * 100, 2) : null;
  const annualReturn = returns.length ? formatNumber(((1 + (mean(returns) || 0)) ** annualFactor - 1) * 100, 2) : null;
  const sharpe = returns.length && stddev(returns) ? formatNumber((mean(returns) / stddev(returns)) * Math.sqrt(annualFactor), 2) : null;

  const maxDrawdown = computeMaxDrawdown(closes);
  const maxDrawdownPct = maxDrawdown != null ? formatNumber(maxDrawdown * 100, 2) : null;

  const bestDay = returns.length ? Math.max(...returns) * 100 : null;
  const worstDay = returns.length ? Math.min(...returns) * 100 : null;
  const bestDayPct = bestDay != null ? formatNumber(bestDay, 2) : null;
  const worstDayPct = worstDay != null ? formatNumber(worstDay, 2) : null;

  const ma10 = formatNumber(simpleMovingAverage(closes, 10), 2);
  const ma20 = formatNumber(simpleMovingAverage(closes, 20), 2);
  const ma50 = formatNumber(simpleMovingAverage(closes, 50), 2);
  const ma200 = formatNumber(simpleMovingAverage(closes, 200), 2);
  const rsi14 = formatNumber(computeRSI(closes, 14), 2);

  const momentum5 = closes.length >= 6 ? formatNumber(((endPrice - closes[closes.length - 6]) / closes[closes.length - 6]) * 100, 2) : null;
  const momentum10 = closes.length >= 11 ? formatNumber(((endPrice - closes[closes.length - 11]) / closes[closes.length - 11]) * 100, 2) : null;
  const momentum20 = closes.length >= 21 ? formatNumber(((endPrice - closes[closes.length - 21]) / closes[closes.length - 21]) * 100, 2) : null;
  const atrRaw = computeAtr(sorted, 14);
  const atr14 = atrRaw != null ? formatNumber(atrRaw, 4) : null;
  const atrPct = atrRaw != null && endPrice ? formatNumber((atrRaw / endPrice) * 100, 2) : null;
  const winStats = computeWinStats(returns);
  const winRate = winStats.winRate != null ? formatNumber(winStats.winRate * 100, 1) : null;
  const avgUp = winStats.avgUp != null ? formatNumber(winStats.avgUp, 2) : null;
  const avgDown = winStats.avgDown != null ? formatNumber(winStats.avgDown, 2) : null;
  const volShort = returns.length >= 10 ? formatNumber((stddev(returns.slice(-10)) || 0) * 100, 3) : null;
  const volLong = returns.length >= 30 ? formatNumber((stddev(returns.slice(-30)) || 0) * 100, 3) : null;
  let volRegime = "";
  if (volShort != null && volLong != null) {
    if (volShort > volLong * 1.25) volRegime = "Volatility rising";
    else if (volShort < volLong * 0.8) volRegime = "Volatility cooling";
    else volRegime = "Volatility stable";
  }
  let maAlignment = "";
  if (ma10 != null && ma20 != null && ma50 != null) {
    if (ma10 > ma20 && ma20 > ma50) maAlignment = "Bullish MA stack (10 > 20 > 50).";
    else if (ma10 < ma20 && ma20 < ma50) maAlignment = "Bearish MA stack (10 < 20 < 50).";
    else maAlignment = "Mixed MA stack (short/long averages are not aligned).";
  }
  const recentHigh = highs.length >= 10 ? Math.max(...highs.slice(-10)) : null;
  const recentLow = lows.length >= 10 ? Math.min(...lows.slice(-10)) : null;
  let breakoutLabel = "";
  if (recentHigh != null && endPrice >= recentHigh * 0.995) {
    breakoutLabel = "Price is pressing the 10-day high (possible breakout).";
  } else if (recentLow != null && endPrice <= recentLow * 1.005) {
    breakoutLabel = "Price is pressing the 10-day low (possible breakdown).";
  }

  const logPrices = closes.map(v => Math.log(v || 1));
  const slope = computeSlope(logPrices);
  const trendStrength = computeTrendStrength(logPrices);
  const trendStrengthPct = trendStrength != null ? formatNumber(trendStrength * 100, 1) : null;
  const trendSlopePct = slope != null ? formatNumber((Math.exp(slope) - 1) * 100, 3) : null;
  let trendLabel = "";
  if (trendSlopePct != null) {
    if (trendSlopePct > 0.15) trendLabel = "Uptrend (strong)";
    else if (trendSlopePct > 0.05) trendLabel = "Uptrend";
    else if (trendSlopePct < -0.15) trendLabel = "Downtrend (strong)";
    else if (trendSlopePct < -0.05) trendLabel = "Downtrend";
    else trendLabel = "Sideways / range-bound";
  }

  const regime = trendLabel
    ? (dailyVol != null && dailyVol > 2
        ? `${trendLabel} with elevated volatility`
        : `${trendLabel} with moderate volatility`)
    : "";

  const avgVolume = volumes.length ? Math.round(mean(volumes)) : null;
  const lastVolume = volumes.length ? Math.round(volumes[volumes.length - 1]) : null;
  const recentVolume = volumes.length >= 5 ? Math.round(mean(volumes.slice(-5))) : null;
  const volumeChangePct = avgVolume && lastVolume
    ? formatNumber(((lastVolume - avgVolume) / avgVolume) * 100, 1)
    : null;

  const support = lows.length ? formatNumber(Math.min(...lows.slice(-20)), 2) : null;
  const resistance = highs.length ? formatNumber(Math.max(...highs.slice(-20)), 2) : null;

  const warnings = [];
  if (points < Math.min(window, 30)) warnings.push("limited history in window");
  if (closes.length < 14) warnings.push("RSI needs more than 14 bars");
  if (closes.length < 50) warnings.push("50-day average unavailable");
  if (closes.length < 200) warnings.push("200-day average unavailable");
  if (!returns.length) warnings.push("returns unavailable");

  const narrative = buildScenarioNarrative({
    symbol: resolvedSymbol,
    assetClass: resolvedClass,
    windowDays: window,
    points,
    startDate,
    endDate,
    startPrice: formatNumber(startPrice, 2),
    endPrice: formatNumber(endPrice, 2),
    returnPct,
    rangeHigh: formatNumber(rangeHigh, 2),
    rangeLow: formatNumber(rangeLow, 2),
    rangePct,
    positionPct,
    rsi14,
    ma10,
    ma20,
    ma50,
    ma200,
    momentum5,
    momentum10,
    momentum20,
    dailyVol,
    annualVol,
    avgDailyReturn,
    annualReturn,
    sharpe,
    maxDrawdownPct: maxDrawdownPct != null ? Math.abs(maxDrawdownPct) : null,
    bestDayPct,
    worstDayPct,
    trendSlopePct,
    trendLabel,
    trendStrengthPct,
    regime,
    avgVolume,
    recentVolume,
    lastVolume,
    volumeChangePct,
    support,
    resistance,
    atr14,
    atrPct,
    volShort,
    volLong,
    volRegime,
    winRate,
    upDays: winStats.upDays,
    downDays: winStats.downDays,
    avgUp,
    avgDown,
    maAlignment,
    breakoutLabel,
    warnings
  });

  return {
    symbol: resolvedSymbol,
    assetClass: resolvedClass,
    windowDays: window,
    provider,
    points,
    startDate,
    endDate,
    startPrice: formatNumber(startPrice, 2),
    endPrice: formatNumber(endPrice, 2),
    returnPct,
    rangeHigh: formatNumber(rangeHigh, 2),
    rangeLow: formatNumber(rangeLow, 2),
    rangePct,
    positionPct,
    rsi14,
    ma10,
    ma20,
    ma50,
    ma200,
    momentum5,
    momentum10,
    momentum20,
    atr14,
    atrPct,
    winRate,
    upDays: winStats.upDays,
    downDays: winStats.downDays,
    avgUp,
    avgDown,
    volShort,
    volLong,
    volRegime,
    avgDailyReturn,
    dailyVol,
    annualVol,
    annualReturn,
    sharpe,
    maxDrawdownPct: maxDrawdownPct != null ? Math.abs(maxDrawdownPct) : null,
    bestDayPct,
    worstDayPct,
    trendSlopePct,
    trendLabel,
    trendStrengthPct,
    maAlignment,
    breakoutLabel,
    regime,
    avgVolume,
    recentVolume,
    lastVolume,
    volumeChangePct,
    support,
    resistance,
    warnings,
    narrative,
    candles: includeCandles ? sorted : undefined
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
