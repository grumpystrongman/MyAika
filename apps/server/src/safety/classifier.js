import { detectPhi, detectSecrets } from "./redact.js";

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /\b\+?\d{1,3}?[ -.]?\(?\d{3}\)?[ -.]?\d{3}[ -.]?\d{4}\b/g;
const FINANCE_RE = /\b(account|routing|iban|swift|wire|transfer|trade|stock|portfolio|crypto)\b/i;

function extractDomains(outboundTargets = []) {
  const domains = [];
  for (const target of outboundTargets) {
    try {
      const url = new URL(target);
      if (url.hostname) domains.push(url.hostname.toLowerCase());
    } catch {
      const cleaned = String(target || "").trim();
      if (cleaned) domains.push(cleaned.toLowerCase());
    }
  }
  return Array.from(new Set(domains));
}

function extractResourceRefs(params = {}) {
  const refs = [];
  const queue = [params];
  while (queue.length) {
    const current = queue.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current)) {
      if (typeof value === "string") {
        if (key.toLowerCase().includes("path") || key.toLowerCase().includes("file")) {
          refs.push(value);
        }
      } else if (Array.isArray(value)) {
        for (const item of value) queue.push(item);
      } else if (typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return refs;
}

function containsPii(text) {
  const value = String(text || "");
  return EMAIL_RE.test(value) || PHONE_RE.test(value);
}

export function classifyAction({ actionType = "", params = {}, outboundTargets = [] } = {}) {
  const combined = JSON.stringify(params || {});
  const phi = detectPhi(combined);
  const secrets = detectSecrets(combined);
  const pii = containsPii(combined);
  const finance = FINANCE_RE.test(combined) || String(actionType).includes("finance");
  const system = String(actionType).startsWith("system.") || String(actionType).includes("install");

  return {
    actionType,
    sensitivity: {
      phi,
      pii,
      secrets,
      finance,
      system
    },
    resourceRefs: extractResourceRefs(params),
    outboundDomains: extractDomains(outboundTargets)
  };
}
