import OpenAI from "openai";
import { recordUsage, getMonthlyUsage } from "./usageStore.js";

let client = null;

const DEFAULT_COST_INPUT_PER_1K = Number(process.env.OPENAI_COST_INPUT_PER_1K || 0.02);
const DEFAULT_COST_OUTPUT_PER_1K = Number(process.env.OPENAI_COST_OUTPUT_PER_1K || 0.02);
const OPENAI_MONTHLY_BUDGET = Number(process.env.OPENAI_MONTHLY_BUDGET || 0);
const OPENAI_TOKEN_CAP = Number(process.env.OPENAI_TOKEN_CAP || 0);

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("missing_openai_api_key");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

function resolveTextModels(primaryOverride) {
  const primary = String(
    primaryOverride ||
    process.env.OPENAI_PRIMARY_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  ).trim();
  const fallback = String(process.env.OPENAI_FALLBACK_MODEL || "").trim();
  return {
    primary,
    fallback: fallback && fallback !== primary ? fallback : ""
  };
}

function shouldFallback(err) {
  const status = Number(err?.status || err?.response?.status || 0);
  if ([404, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("model") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("capacity")
  );
}

function estimateTokensFromText(text) {
  const raw = String(text || "");
  if (!raw) return 0;
  return Math.max(1, Math.ceil(raw.length / 4));
}

function estimateTokensFromInput(input) {
  if (!input) return 0;
  if (typeof input === "string") return estimateTokensFromText(input);
  if (Array.isArray(input)) {
    let total = 0;
    for (const item of input) {
      if (!item) continue;
      if (typeof item === "string") {
        total += estimateTokensFromText(item);
        continue;
      }
      const content = Array.isArray(item.content) ? item.content : [];
      for (const c of content) {
        if (!c) continue;
        if (typeof c === "string") total += estimateTokensFromText(c);
        if (typeof c.text === "string") total += estimateTokensFromText(c.text);
      }
      if (typeof item.text === "string") total += estimateTokensFromText(item.text);
    }
    return total;
  }
  if (typeof input === "object") {
    const content = Array.isArray(input.content) ? input.content : [];
    let total = 0;
    for (const c of content) {
      if (typeof c?.text === "string") total += estimateTokensFromText(c.text);
    }
    if (typeof input.text === "string") total += estimateTokensFromText(input.text);
    return total;
  }
  return 0;
}

function estimateTokensFromMessages(messages = []) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const msg of messages) {
    if (!msg) continue;
    if (typeof msg.content === "string") {
      total += estimateTokensFromText(msg.content);
      continue;
    }
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const c of content) {
      if (!c) continue;
      if (typeof c === "string") total += estimateTokensFromText(c);
      if (typeof c.text === "string") total += estimateTokensFromText(c.text);
    }
  }
  return total;
}

function loadModelCost(model = "") {
  const raw = String(process.env.OPENAI_COST_BY_MODEL || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const entry = parsed?.[model];
    if (!entry) return null;
    const input = Number(entry.input || entry.prompt || entry.in || DEFAULT_COST_INPUT_PER_1K);
    const output = Number(entry.output || entry.completion || entry.out || DEFAULT_COST_OUTPUT_PER_1K);
    return { input, output };
  } catch {
    return null;
  }
}

function estimateCost({ model, promptTokens = 0, completionTokens = 0 }) {
  const modelCost = loadModelCost(model) || {
    input: DEFAULT_COST_INPUT_PER_1K,
    output: DEFAULT_COST_OUTPUT_PER_1K
  };
  const inputCost = (promptTokens / 1000) * modelCost.input;
  const outputCost = (completionTokens / 1000) * modelCost.output;
  return Number((inputCost + outputCost).toFixed(6));
}

async function enforceBudget({ model, promptTokens = 0, completionTokens = 0 }) {
  if (!Number.isFinite(OPENAI_MONTHLY_BUDGET) || OPENAI_MONTHLY_BUDGET <= 0) return;
  const usage = await getMonthlyUsage();
  const estimatedCost = estimateCost({ model, promptTokens, completionTokens });
  const total = Number(usage.totalCost || 0) + estimatedCost;
  if (total > OPENAI_MONTHLY_BUDGET) {
    throw new Error("openai_monthly_budget_exceeded");
  }
}

function enforceTokenCap({ inputTokens = 0, outputTokens = 0 }) {
  if (!Number.isFinite(OPENAI_TOKEN_CAP) || OPENAI_TOKEN_CAP <= 0) return;
  const total = inputTokens + outputTokens;
  if (total > OPENAI_TOKEN_CAP) {
    throw new Error("openai_token_cap_exceeded");
  }
}

function extractUsageFromResponse(response = {}) {
  const usage = response?.usage || {};
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? (promptTokens + completionTokens));
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0
  };
}

async function recordUsageFromResponse({ model, response, fallbackUsage }) {
  const usage = extractUsageFromResponse(response);
  const promptTokens = usage.promptTokens || fallbackUsage?.promptTokens || 0;
  const completionTokens = usage.completionTokens || fallbackUsage?.completionTokens || 0;
  const totalTokens = usage.totalTokens || promptTokens + completionTokens;
  const costUsd = estimateCost({ model, promptTokens, completionTokens });
  await recordUsage({
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd
  });
}

export function getOpenAIClient() {
  return getClient();
}

export async function responsesCreate(options = {}) {
  const { primary, fallback } = resolveTextModels(options.model);
  const model = primary;
  const inputTokens = estimateTokensFromInput(options.input);
  const outputTokens = Number(options.max_output_tokens || 0);
  enforceTokenCap({ inputTokens, outputTokens });
  await enforceBudget({ model, promptTokens: inputTokens, completionTokens: outputTokens });
  try {
    const response = await getClient().responses.create({ ...options, model });
    await recordUsageFromResponse({ model, response, fallbackUsage: { promptTokens: inputTokens, completionTokens: outputTokens } });
    return response;
  } catch (err) {
    if (!fallback || !shouldFallback(err)) throw err;
    await enforceBudget({ model: fallback, promptTokens: inputTokens, completionTokens: outputTokens });
    const response = await getClient().responses.create({ ...options, model: fallback });
    await recordUsageFromResponse({ model: fallback, response, fallbackUsage: { promptTokens: inputTokens, completionTokens: outputTokens } });
    return response;
  }
}

export async function chatCompletionsCreate(options = {}) {
  const { primary, fallback } = resolveTextModels(options.model);
  const model = primary;
  const inputTokens = estimateTokensFromMessages(options.messages || []);
  const outputTokens = Number(options.max_tokens || options.max_output_tokens || 0);
  enforceTokenCap({ inputTokens, outputTokens });
  await enforceBudget({ model, promptTokens: inputTokens, completionTokens: outputTokens });
  try {
    const response = await getClient().chat.completions.create({ ...options, model });
    await recordUsageFromResponse({ model, response, fallbackUsage: { promptTokens: inputTokens, completionTokens: outputTokens } });
    return response;
  } catch (err) {
    if (!fallback || !shouldFallback(err)) throw err;
    await enforceBudget({ model: fallback, promptTokens: inputTokens, completionTokens: outputTokens });
    const response = await getClient().chat.completions.create({ ...options, model: fallback });
    await recordUsageFromResponse({ model: fallback, response, fallbackUsage: { promptTokens: inputTokens, completionTokens: outputTokens } });
    return response;
  }
}

export async function embeddingsCreate(options = {}) {
  const model = String(options.model || process.env.OPENAI_EMBEDDING_MODEL || "").trim();
  const inputTokens = estimateTokensFromInput(options.input);
  enforceTokenCap({ inputTokens, outputTokens: 0 });
  await enforceBudget({ model, promptTokens: inputTokens, completionTokens: 0 });
  const response = await getClient().embeddings.create({ ...options, model });
  await recordUsageFromResponse({ model, response, fallbackUsage: { promptTokens: inputTokens, completionTokens: 0 } });
  return response;
}

export async function transcriptionsCreate(options = {}) {
  const model = String(options.model || process.env.OPENAI_TRANSCRIBE_MODEL || "").trim();
  await enforceBudget({ model, promptTokens: 0, completionTokens: 0 });
  const response = await getClient().audio.transcriptions.create({ ...options, model });
  return response;
}
