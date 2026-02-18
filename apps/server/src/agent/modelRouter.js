import OpenAI from "openai";

let localClient = null;
let cloudClient = null;

function normalize(value) {
  return String(value || "").trim();
}

function hasValue(value) {
  return Boolean(normalize(value));
}

function getLocalConfig() {
  const baseURL = normalize(process.env.LOCAL_LLM_BASE_URL || process.env.LOCAL_LLM_URL || "");
  const apiKey = normalize(process.env.LOCAL_LLM_API_KEY || "local");
  const model = normalize(process.env.LOCAL_LLM_MODEL || process.env.LOCAL_MODEL || "local-model");
  return { baseURL, apiKey, model };
}

function getCloudConfig() {
  const apiKey = normalize(process.env.OPENAI_API_KEY || "");
  const model = normalize(process.env.OPENAI_MODEL || "gpt-4o-mini");
  return { apiKey, model };
}

function getLocalClient() {
  const { baseURL, apiKey } = getLocalConfig();
  if (!hasValue(baseURL)) return null;
  if (!localClient) localClient = new OpenAI({ apiKey, baseURL });
  return localClient;
}

function getCloudClient() {
  const { apiKey } = getCloudConfig();
  if (!cloudClient) cloudClient = new OpenAI({ apiKey });
  return cloudClient;
}

export function routeModel({ purpose = "general", preferLocal = false, requireCloud = false } = {}) {
  const mode = normalize(process.env.MODEL_ROUTER_MODE || "auto").toLowerCase();
  const local = getLocalConfig();
  const cloud = getCloudConfig();
  const hasLocal = hasValue(local.baseURL);
  const hasCloud = hasValue(cloud.apiKey);

  let provider = "cloud";
  let reason = "cloud_default";
  if (requireCloud) {
    provider = "cloud";
    reason = "require_cloud";
  } else if (mode === "local") {
    provider = hasLocal ? "local" : "cloud";
    reason = hasLocal ? "mode_local" : "mode_local_fallback";
  } else if (mode === "cloud") {
    provider = "cloud";
    reason = "mode_cloud";
  } else {
    if (preferLocal && hasLocal) {
      provider = "local";
      reason = "prefer_local";
    } else if (!hasCloud && hasLocal) {
      provider = "local";
      reason = "cloud_missing";
    } else if (hasCloud) {
      provider = "cloud";
      reason = "cloud_available";
    } else if (hasLocal) {
      provider = "local";
      reason = "local_available";
    }
  }

  if (provider === "cloud" && !hasCloud && hasLocal) {
    provider = "local";
    reason = "cloud_missing";
  }

  if (provider === "local") {
    return {
      provider,
      model: local.model,
      client: getLocalClient(),
      reason,
      purpose,
      baseURL: local.baseURL
    };
  }

  return {
    provider,
    model: cloud.model,
    client: getCloudClient(),
    reason,
    purpose
  };
}

export function resetModelRouter() {
  localClient = null;
  cloudClient = null;
}
