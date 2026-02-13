import crypto from "node:crypto";
import { getRuntimeFlags } from "../storage/runtime_flags.js";

const PHONE_RE = /(?:\+?1\s*)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB_RE = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
const MRN_RE = /\b(?:MRN|Medical\s*Record)\s*#?\s*\d{5,10}\b/gi;
const ADDRESS_RE = /\b\d{1,5}\s+[A-Z0-9][A-Z0-9\s.-]{2,}\b/gi;
const PATIENT_TERMS = /\b(patient|diagnosis|treatment|hipaa|phi|ssn)\b/gi;

function hash(input) {
  return crypto.createHash("sha256").update(String(input || "")).digest("hex");
}

export function detectPhi(text) {
  const input = String(text || "");
  const matches = [];
  const add = (type, re) => {
    const found = input.match(re);
    if (found?.length) matches.push({ type, count: found.length });
  };
  add("phone", PHONE_RE);
  add("email", EMAIL_RE);
  add("ssn", SSN_RE);
  add("dob", DOB_RE);
  add("mrn", MRN_RE);
  add("address", ADDRESS_RE);
  add("patient_terms", PATIENT_TERMS);

  const score = matches.reduce((sum, m) => sum + Math.min(3, m.count), 0);
  return { matches, score, hasPhi: score >= 2 };
}

export function redactPhi(text) {
  let out = String(text || "");
  out = out.replace(PHONE_RE, "[REDACTED_PHONE]");
  out = out.replace(EMAIL_RE, "[REDACTED_EMAIL]");
  out = out.replace(SSN_RE, "[REDACTED_SSN]");
  out = out.replace(DOB_RE, "[REDACTED_DOB]");
  out = out.replace(MRN_RE, "[REDACTED_MRN]");
  out = out.replace(ADDRESS_RE, "[REDACTED_ADDRESS]");
  return out;
}

function parseAllowlist(raw) {
  return raw
    ? raw
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    : [];
}

export function getPolicyConfig() {
  const flags = getRuntimeFlags();
  return {
    phiMode: process.env.PHI_MODE !== "false",
    allowlistNormal: parseAllowlist(process.env.TOOL_ALLOWLIST_BY_MODE_NORMAL || ""),
    allowlistPhi: parseAllowlist(process.env.TOOL_ALLOWLIST_BY_MODE_PHI || ""),
    allowedDomains: parseAllowlist(process.env.ALLOWED_OUTBOUND_DOMAINS || ""),
    outboundDisabled: String(process.env.TOOLS_PANIC_SWITCH || "0") === "1" || Boolean(flags.outboundToolsDisabled)
  };
}

export function checkOutboundDomains(outboundTargets = [], allowedDomains = []) {
  if (!allowedDomains.length) return true;
  return outboundTargets.every(target => {
    try {
      const host = new URL(target).hostname;
      return allowedDomains.some(allowed => host.endsWith(allowed));
    } catch {
      return false;
    }
  });
}

export function evaluatePolicy({ tool, params, context, outboundTargets = [] }) {
  const cfg = getPolicyConfig();
  const mode = context?.mode || (cfg.phiMode ? "phi" : "normal");
  const allowlist = mode === "phi" ? cfg.allowlistPhi : cfg.allowlistNormal;
  const allowlisted = !allowlist.length || allowlist.includes(tool.name);

  const rawParams = JSON.stringify(params || {});
  const phi = detectPhi(rawParams);
  const redactedParamsText = redactPhi(rawParams);
  let redactedParams = params;
  try {
    redactedParams = JSON.parse(redactedParamsText);
  } catch {
    redactedParams = { _raw: redactedParamsText };
  }

  const outboundOk = checkOutboundDomains(outboundTargets, cfg.allowedDomains);
  const outboundBlocked = tool.outbound && (cfg.outboundDisabled || !outboundOk);
  const block = !allowlisted || outboundBlocked;

  const requiresApproval =
    Boolean(tool.requiresApproval) ||
    (tool.outbound && phi.hasPhi && mode === "phi");

  return {
    mode,
    allowlisted,
    phi,
    redactedParams,
    block,
    requiresApproval,
    policyHash: hash(JSON.stringify({ mode, allowlisted, outboundOk, phi: phi.matches }))
  };
}

