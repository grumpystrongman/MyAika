import crypto from "node:crypto";
import { getPolicy } from "./policyLoader.js";

const DEFAULT_SENSITIVE_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "cookie",
  "set-cookie",
  "session",
  "private_key",
  "access_key",
  "refresh_token"
];

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /AIza[0-9A-Za-z-_]{30,}/g,
  /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
  /ya29\.[0-9A-Za-z-_]+/g,
  /ghp_[A-Za-z0-9]{20,}/g
];

const PHI_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{9}\b/g,
  /\bMRN[:\s-]*\d{5,}\b/gi,
  /\bDOB[:\s-]*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/gi,
  /\bSSN[:\s-]*\d{3}-\d{2}-\d{4}\b/gi
];

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function redactByPatterns(text, patterns) {
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, match => `[redacted:${hashToken(match)}]`);
  }
  return out;
}

export function detectSecrets(text) {
  const value = String(text || "");
  for (const re of SECRET_PATTERNS) {
    if (re.test(value)) return true;
  }
  return false;
}

export function detectPhi(text) {
  const value = String(text || "");
  // Avoid flagging numeric IDs embedded in URLs as PHI.
  const scrubbed = value.replace(/https?:\/\/\S+/gi, " ");
  for (const re of PHI_PATTERNS) {
    if (re.test(scrubbed)) return true;
  }
  return false;
}

export function redactString(value) {
  const text = String(value || "");
  const policy = getPolicy();
  const patterns = Array.isArray(policy?.logging?.redaction?.patterns)
    ? policy.logging.redaction.patterns.map(p => new RegExp(p, "gi"))
    : [];
  let redacted = redactByPatterns(text, [...patterns, ...SECRET_PATTERNS, ...PHI_PATTERNS]);
  return redacted;
}

function redactObjectValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(item => redactObjectValue(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      const keyLower = key.toLowerCase();
      if (DEFAULT_SENSITIVE_KEYS.some(k => keyLower.includes(k))) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactObjectValue(val, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function redactPayload(payload) {
  if (payload == null) return payload;
  return redactObjectValue(payload);
}

export function redactJsonString(payload) {
  try {
    return JSON.stringify(redactPayload(payload));
  } catch {
    return JSON.stringify({ redacted: true });
  }
}
