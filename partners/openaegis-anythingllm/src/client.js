const DEFAULT_TIMEOUT_MS = Number(process.env.OPENAEGIS_TIMEOUT_MS || 20000);

function trimRightSlash(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function resolveConfig() {
  const baseUrl = trimRightSlash(process.env.OPENAEGIS_BASE_URL || "");
  const apiKey = process.env.OPENAEGIS_API_KEY || "";
  if (!baseUrl) throw new Error("OPENAEGIS_BASE_URL is required");
  if (!apiKey) throw new Error("OPENAEGIS_API_KEY is required");
  return { baseUrl, apiKey, timeoutMs: DEFAULT_TIMEOUT_MS };
}

export async function openAegisRequest(path, { method = "GET", body } = {}) {
  const cfg = resolveConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), cfg.timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload?.error || payload?.message || "openaegis_request_failed";
      throw new Error(reason);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function healthCheck() {
  return openAegisRequest("/health");
}

export async function sendChat(userText, context = {}) {
  return openAegisRequest("/chat", {
    method: "POST",
    body: { userText, ...context }
  });
}

export async function runModule(moduleName, inputPayload = {}) {
  return openAegisRequest("/api/aika/modules/run", {
    method: "POST",
    body: { moduleName, inputPayload }
  });
}

export async function runRunbook(name, inputPayload = {}) {
  return openAegisRequest("/api/aika/runbooks/run", {
    method: "POST",
    body: { name, inputPayload }
  });
}
