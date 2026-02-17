export function parseList(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function stripHtml(rawHtml) {
  let text = String(rawHtml || "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&quot;/gi, "\"");
  text = text.replace(/&#39;/gi, "'");
  return normalizeText(text);
}

export function limitText(text, maxChars) {
  const value = String(text || "");
  if (!maxChars || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

export function isoDaysAgo(days) {
  const diffDays = Number(days || 0);
  if (!Number.isFinite(diffDays) || diffDays <= 0) return "";
  return new Date(Date.now() - diffDays * 86400000).toISOString();
}

export async function fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, { method = "GET", headers = {}, body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`fetch_failed_${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}
