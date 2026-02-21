import { sleep } from "../signals/utils.js";

function normalizeHeaders(headers = {}) {
  const normalized = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    normalized[key] = value;
  });
  return normalized;
}

function shouldRetryStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

async function waitForBackoff(attempt, { minDelayMs, maxDelayMs, jitterRatio }) {
  const base = Math.min(maxDelayMs, minDelayMs * Math.pow(2, attempt));
  const jitter = base * (jitterRatio ?? 0.2);
  const delay = Math.max(0, base - jitter + Math.random() * jitter * 2);
  await sleep(delay);
}

export async function fetchWithRetry(url, options = {}, retry = {}, fetchFn = fetch) {
  const retries = Number(retry.retries ?? 3);
  const minDelayMs = Number(retry.minDelayMs ?? 800);
  const maxDelayMs = Number(retry.maxDelayMs ?? 8000);
  const jitterRatio = Number(retry.jitterRatio ?? 0.2);

  let attempt = 0;
  while (attempt <= retries) {
    try {
      const response = await fetchFn(url, options);
      if (!shouldRetryStatus(response.status)) return response;
      if (attempt >= retries) return response;
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        const delay = Number(retryAfter) * 1000;
        if (Number.isFinite(delay) && delay > 0) {
          await sleep(Math.min(delay, maxDelayMs));
        } else {
          await waitForBackoff(attempt, { minDelayMs, maxDelayMs, jitterRatio });
        }
      } else {
        await waitForBackoff(attempt, { minDelayMs, maxDelayMs, jitterRatio });
      }
    } catch (err) {
      if (attempt >= retries) throw err;
      await waitForBackoff(attempt, { minDelayMs, maxDelayMs, jitterRatio });
    }
    attempt += 1;
  }
  throw new Error("fetch_failed");
}

export async function fetchTextWithMeta(url, { headers = {}, timeoutMs = 15000, retry = {}, method = "GET", body, fetchFn } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const mergedHeaders = normalizeHeaders(headers);
  try {
    const response = await fetchWithRetry(url, {
      method,
      headers: mergedHeaders,
      body,
      signal: controller.signal
    }, retry, fetchFn);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const etag = response.headers.get("etag") || "";
    const lastModified = response.headers.get("last-modified") || "";
    if (response.status === 304) {
      return { ok: true, status: 304, text: "", headers: response.headers, contentType, etag, lastModified };
    }
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, headers: response.headers, contentType, etag, lastModified };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBufferWithMeta(url, { headers = {}, timeoutMs = 20000, retry = {}, method = "GET", body, fetchFn } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const mergedHeaders = normalizeHeaders(headers);
  try {
    const response = await fetchWithRetry(url, {
      method,
      headers: mergedHeaders,
      body,
      signal: controller.signal
    }, retry, fetchFn);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const etag = response.headers.get("etag") || "";
    const lastModified = response.headers.get("last-modified") || "";
    if (response.status === 304) {
      return { ok: true, status: 304, buffer: null, headers: response.headers, contentType, etag, lastModified };
    }
    const arrayBuffer = await response.arrayBuffer();
    return { ok: response.ok, status: response.status, buffer: Buffer.from(arrayBuffer), headers: response.headers, contentType, etag, lastModified };
  } finally {
    clearTimeout(timer);
  }
}
