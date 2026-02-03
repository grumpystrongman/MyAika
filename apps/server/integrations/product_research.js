import { searchAmazonItems } from "./amazon_paapi.js";
import { searchWeb } from "./web_search.js";

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function cleanText(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const stripped = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAmazonItems(rawItems = []) {
  return rawItems
    .map((item, index) => ({
      rank: index + 1,
      asin: item?.asin || "",
      title: cleanText(item?.title || "", 300),
      priceDisplay: item?.price || "",
      priceValue: toNumber(item?.price),
      url: item?.url || "",
      image: item?.image || ""
    }))
    .filter(item => item.title);
}

export function buildAmazonAddToCartUrl({ asin, quantity = 1 }) {
  const normalizedAsin = String(asin || "").trim();
  if (!normalizedAsin) throw new Error("asin_required");
  const qty = clampInt(quantity, 1, 10, 1);
  const domain = process.env.AMAZON_CART_DOMAIN || "www.amazon.com";
  const url = new URL(`https://${domain}/gp/aws/cart/add.html`);
  url.searchParams.set("ASIN.1", normalizedAsin);
  url.searchParams.set("Quantity.1", String(qty));
  const tag = process.env.AMAZON_PARTNER_TAG || "";
  if (tag) url.searchParams.set("AssociateTag", tag);
  return url.toString();
}

async function generateLlmAnalysis({ query, candidates, webResults, openaiClient, model }) {
  if (!openaiClient || !model || !candidates.length) return null;
  try {
    const prompt = [
      "You are a strict product analyst. Compare options and recommend one best value item.",
      "Return JSON only with keys: summary, recommendation, reasoning, watchouts, best_asin.",
      `Query: ${query}`,
      `Candidates: ${JSON.stringify(candidates.slice(0, 6), null, 2)}`,
      `Web signals: ${JSON.stringify(webResults?.results || [], null, 2)}`
    ].join("\n\n");
    const response = await openaiClient.responses.create({
      model,
      input: prompt,
      max_output_tokens: 450
    });
    const text =
      (Array.isArray(response?.output_text) ? response.output_text.join("\n") : response?.output_text) ||
      "";
    const parsed = parseJsonLoose(text);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      summary: cleanText(parsed.summary || "", 400),
      recommendation: cleanText(parsed.recommendation || "", 220),
      reasoning: cleanText(parsed.reasoning || "", 400),
      watchouts: cleanText(parsed.watchouts || "", 220),
      bestAsin: cleanText(parsed.best_asin || "", 40)
    };
  } catch {
    return null;
  }
}

export async function runProductResearch({
  query,
  budget = null,
  limit = 8,
  openaiClient = null,
  model = ""
}) {
  const normalizedQuery = cleanText(query, 180);
  if (!normalizedQuery) throw new Error("query_required");

  const resultLimit = clampInt(limit, 3, 12, 8);
  let amazonItems = [];
  let amazonError = "";
  try {
    const amazon = await searchAmazonItems({ keywords: normalizedQuery, itemCount: resultLimit });
    amazonItems = normalizeAmazonItems(amazon?.items || []);
  } catch (err) {
    amazonError = err?.message || "amazon_search_failed";
  }

  let webResults = { query: normalizedQuery, source: "duckduckgo_instant_answer", results: [] };
  try {
    webResults = await searchWeb(`${normalizedQuery} best price`, 5);
  } catch {
    // keep fallback web object
  }

  const budgetValue = toNumber(budget);
  const budgetCandidates =
    budgetValue === null
      ? amazonItems
      : amazonItems.filter(item => item.priceValue !== null && item.priceValue <= budgetValue);
  const sortable = (budgetCandidates.length ? budgetCandidates : amazonItems).slice();
  sortable.sort((a, b) => {
    const av = Number.isFinite(a.priceValue) ? a.priceValue : Number.POSITIVE_INFINITY;
    const bv = Number.isFinite(b.priceValue) ? b.priceValue : Number.POSITIVE_INFINITY;
    return av - bv;
  });
  const bestItem = sortable[0] || amazonItems[0] || null;

  const llmAnalysis = await generateLlmAnalysis({
    query: normalizedQuery,
    candidates: amazonItems,
    webResults,
    openaiClient,
    model
  });

  const deterministicSummary = bestItem
    ? `I compared ${amazonItems.length} Amazon listings and selected ${bestItem.title} as best value based on available pricing.`
    : `I could not score Amazon listings for "${normalizedQuery}" yet.`;

  const analysis = {
    summary: llmAnalysis?.summary || deterministicSummary,
    recommendation:
      llmAnalysis?.recommendation ||
      (bestItem ? `Best value pick: ${bestItem.title}` : "No clear recommendation yet."),
    reasoning:
      llmAnalysis?.reasoning ||
      (bestItem && bestItem.priceDisplay
        ? `Lowest detected listed price: ${bestItem.priceDisplay}.`
        : "Pricing data is limited; recommendation uses available listing quality signals."),
    watchouts:
      llmAnalysis?.watchouts ||
      "Verify seller rating, return policy, and shipping time before checkout.",
    bestAsin: llmAnalysis?.bestAsin || bestItem?.asin || ""
  };

  let topOptions = (sortable.length ? sortable : amazonItems).slice(0, 5);
  if (!topOptions.length) {
    topOptions = (webResults?.results || []).slice(0, 5).map((item, idx) => ({
      rank: idx + 1,
      asin: "",
      title: cleanText(item.title || "", 280),
      priceDisplay: "Price unavailable",
      priceValue: null,
      url: item.url || "",
      image: ""
    }));
  }
  const cartActions = topOptions
    .filter(item => item.asin)
    .map(item => ({
      asin: item.asin,
      title: item.title,
      quantity: 1,
      addToCartUrl: buildAmazonAddToCartUrl({ asin: item.asin, quantity: 1 })
    }));

  return {
    query: normalizedQuery,
    generatedAt: new Date().toISOString(),
    budget: budgetValue,
    amazon: {
      configured: !amazonError,
      error: amazonError || null,
      items: amazonItems
    },
    web: webResults,
    analysis,
    options: topOptions,
    recommendationAsin: analysis.bestAsin || bestItem?.asin || "",
    recommendationItem:
      topOptions.find(item => item.asin && item.asin === (analysis.bestAsin || "")) ||
      bestItem ||
      topOptions[0] ||
      null,
    cartActions
  };
}
