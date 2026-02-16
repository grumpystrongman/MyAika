const STOCK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CRYPTO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let stockCache = { fetchedAt: 0, items: [], source: "" };
let cryptoCache = { fetchedAt: 0, items: [], source: "" };

function now() {
  return Date.now();
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesQuery(text, query) {
  if (!query) return true;
  return String(text || "").toLowerCase().includes(query);
}

async function fetchAlpacaAssets() {
  const key = process.env.ALPACA_API_KEY || process.env.ALPACA_DATA_KEY || "";
  const secret = process.env.ALPACA_API_SECRET || process.env.ALPACA_DATA_SECRET || "";
  if (!key || !secret) return null;
  const baseUrl = process.env.ALPACA_API_BASE || "https://paper-api.alpaca.markets";
  const url = `${baseUrl}/v2/assets?status=active&asset_class=us_equity`;
  const resp = await fetch(url, {
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret
    }
  });
  if (!resp.ok) throw new Error("alpaca_assets_failed");
  const data = await resp.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.map(item => ({
    symbol: item.symbol,
    name: item.name || "",
    exchange: item.exchange || "",
    assetClass: "stock",
    source: "alpaca"
  }));
}

async function fetchYahooSearch(query, limit) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${limit}&newsCount=0`;
  const resp = await fetch(url, { headers: { "User-Agent": "AikaTrading/1.0" } });
  if (!resp.ok) throw new Error("yahoo_search_failed");
  const data = await resp.json().catch(() => ({}));
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  return quotes
    .filter(item => item.symbol)
    .map(item => ({
      symbol: item.symbol,
      name: item.shortname || item.longname || item.name || "",
      exchange: item.exchange || item.exchDisp || "",
      assetClass: item.quoteType?.toLowerCase() === "cryptocurrency" ? "crypto" : "stock",
      source: "yahoo"
    }));
}

async function ensureStockCache() {
  const age = now() - stockCache.fetchedAt;
  if (stockCache.items.length && age < STOCK_CACHE_TTL_MS) return stockCache;
  try {
    const items = await fetchAlpacaAssets();
    if (items) {
      stockCache = { fetchedAt: now(), items, source: "alpaca" };
      return stockCache;
    }
  } catch {
    // ignore alpaca failures
  }
  stockCache = { fetchedAt: now(), items: [], source: "" };
  return stockCache;
}

async function searchStockSymbols(query, limit = 12) {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const cache = await ensureStockCache();
  if (cache.items.length) {
    return cache.items
      .filter(item => matchesQuery(item.symbol, normalized) || matchesQuery(item.name, normalized))
      .slice(0, limit);
  }
  try {
    const results = await fetchYahooSearch(query, limit);
    return results
      .filter(item => item.assetClass === "stock")
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function fetchCoinbaseProducts() {
  const resp = await fetch("https://api.exchange.coinbase.com/products", { headers: { "User-Agent": "AikaTrading/1.0" } });
  if (!resp.ok) throw new Error("coinbase_products_failed");
  const data = await resp.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.map(item => ({
    symbol: item.id,
    name: item.display_name || item.id,
    base: item.base_currency || "",
    quote: item.quote_currency || "",
    assetClass: "crypto",
    source: "coinbase"
  }));
}

async function ensureCryptoCache() {
  const age = now() - cryptoCache.fetchedAt;
  if (cryptoCache.items.length && age < CRYPTO_CACHE_TTL_MS) return cryptoCache;
  try {
    const items = await fetchCoinbaseProducts();
    cryptoCache = { fetchedAt: now(), items, source: "coinbase" };
    return cryptoCache;
  } catch {
    cryptoCache = { fetchedAt: now(), items: [], source: "" };
    return cryptoCache;
  }
}

async function searchCryptoSymbols(query, limit = 12) {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const cache = await ensureCryptoCache();
  return cache.items
    .filter(item => matchesQuery(item.symbol, normalized) || matchesQuery(item.name, normalized) || matchesQuery(item.base, normalized))
    .slice(0, limit);
}

export async function searchSymbols({ query, assetClass = "all", limit = 12 } = {}) {
  const normalized = normalizeQuery(query);
  if (!normalized) return { results: [], source: "" };
  const max = Math.min(25, Math.max(1, Number(limit || 12)));
  if (assetClass === "crypto") {
    const results = await searchCryptoSymbols(normalized, max);
    return { results, source: "coinbase" };
  }
  if (assetClass === "stock") {
    const results = await searchStockSymbols(normalized, max);
    return { results, source: results[0]?.source || "" };
  }
  const [stocks, crypto] = await Promise.all([
    searchStockSymbols(normalized, Math.ceil(max * 0.6)),
    searchCryptoSymbols(normalized, Math.ceil(max * 0.4))
  ]);
  return { results: [...stocks, ...crypto].slice(0, max), source: "mixed" };
}
