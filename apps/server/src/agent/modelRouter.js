import { getOpenAIClient } from "../llm/openaiClient.js";

function normalize(value) {
  return String(value || "").trim();
}

function getCloudConfig() {
  const apiKey = normalize(process.env.OPENAI_API_KEY || "");
  const model = normalize(process.env.OPENAI_PRIMARY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini");
  return { apiKey, model };
}

export function routeModel({ purpose = "general" } = {}) {
  const cloud = getCloudConfig();
  const hasCloud = Boolean(cloud.apiKey);
  return {
    provider: "cloud",
    model: cloud.model,
    client: hasCloud ? getOpenAIClient() : null,
    reason: hasCloud ? "openai_only" : "openai_missing",
    purpose
  };
}

export function resetModelRouter() {
  // no-op; client is managed by shared wrapper
}
