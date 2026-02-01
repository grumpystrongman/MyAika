const REDACTION_PATTERNS = [
  { type: "email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, token: "[REDACTED_EMAIL]" },
  { type: "phone", re: /(\+?\d{1,2}[\s-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g, token: "[REDACTED_PHONE]" },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, token: "[REDACTED_SSN]" },
  { type: "mrn", re: /\bMRN[:\s]*\d{5,}\b/gi, token: "[REDACTED_MRN]" },
  { type: "address", re: /\b\d{1,5}\s+[A-Za-z0-9.\s]+(St|Street|Ave|Avenue|Blvd|Road|Rd|Lane|Ln|Drive|Dr)\b/gi, token: "[REDACTED_ADDRESS]" }
];

export function redactText(text) {
  let output = String(text || "");
  for (const rule of REDACTION_PATTERNS) {
    output = output.replace(rule.re, rule.token);
  }
  return output;
}

export function redactStructured(obj) {
  if (!obj) return obj;
  if (typeof obj === "string") return redactText(obj);
  if (Array.isArray(obj)) return obj.map(item => redactStructured(item));
  if (typeof obj === "object") {
    const next = {};
    for (const [key, value] of Object.entries(obj)) {
      next[key] = redactStructured(value);
    }
    return next;
  }
  return obj;
}
