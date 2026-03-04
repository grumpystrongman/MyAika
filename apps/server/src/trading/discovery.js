function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function isCryptoSymbol(symbol) {
  const value = String(symbol || "");
  return value.includes("-") || value.endsWith("-USD");
}

function matchesAssetClass(symbol, assetClass) {
  if (assetClass === "crypto") return isCryptoSymbol(symbol);
  if (assetClass === "stock") return !isCryptoSymbol(symbol);
  return true;
}

export function buildDiscoveryUniverse({
  watchlist = [],
  discovered = [],
  assetClass = "all",
  max = 60
} = {}) {
  const resolvedMax = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 60;
  const normalizedClass = String(assetClass || "all").toLowerCase();
  const seen = new Set();
  const output = [];

  const append = (items) => {
    for (const item of items || []) {
      const symbol = normalizeSymbol(item);
      if (!symbol) continue;
      if (!matchesAssetClass(symbol, normalizedClass)) continue;
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      output.push(symbol);
      if (output.length >= resolvedMax) break;
    }
  };

  append(watchlist);
  if (output.length < resolvedMax) append(discovered);

  return output;
}

export function normalizeSymbols(list = []) {
  const seen = new Set();
  const output = [];
  for (const item of list || []) {
    const symbol = normalizeSymbol(item);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    output.push(symbol);
  }
  return output;
}

export function filterSymbolsByClass(list = [], assetClass = "all") {
  const normalizedClass = String(assetClass || "all").toLowerCase();
  return (list || []).filter(symbol => matchesAssetClass(symbol, normalizedClass));
}
