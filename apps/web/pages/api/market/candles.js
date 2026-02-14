function mapGranularity(interval) {
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

function parseStooqCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const rows = lines.slice(1);
  return rows.map(line => {
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

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim();
  const asset = String(req.query.asset || "crypto").toLowerCase();
  const interval = String(req.query.interval || "1h").toLowerCase();
  if (!symbol) {
    res.status(400).json({ error: "symbol_required" });
    return;
  }

  try {
    if (asset === "stock") {
      const { key, secret } = getAlpacaCreds();
      if (key && secret) {
        try {
          const timeframe = mapAlpacaTimeframe(interval);
          const feed = process.env.ALPACA_DATA_FEED || "iex";
          const limit = interval === "1d" ? 200 : 300;
          const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}&feed=${encodeURIComponent(feed)}`;
          const resp = await fetch(url, {
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
                o: row.o,
                h: row.h,
                l: row.l,
                c: row.c,
                v: row.v
              }))
            : [];
          res.json({ source: "alpaca", candles });
          return;
        } catch {
          // fall back to stooq
        }
      }

      const stooqSymbol = `${symbol.toLowerCase()}.us`;
      const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("stooq_failed");
      const text = await resp.text();
      const candles = parseStooqCsv(text);
      res.json({ source: "stooq", candles });
      return;
    }

    const granularity = mapGranularity(interval);
    const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles?granularity=${granularity}`;
    const resp = await fetch(url, { headers: { "User-Agent": "AikaTrading/1.0" } });
    if (!resp.ok) throw new Error("coinbase_failed");
    const data = await resp.json();
    const candles = Array.isArray(data)
      ? data.map(row => ({
          t: row[0] * 1000,
          l: row[1],
          h: row[2],
          o: row[3],
          c: row[4],
          v: row[5]
        })).sort((a, b) => a.t - b.t)
      : [];
    res.json({ source: "coinbase", candles });
  } catch (err) {
    res.status(200).json({ source: "unavailable", candles: [], error: err?.message || "market_fetch_failed" });
  }
}
