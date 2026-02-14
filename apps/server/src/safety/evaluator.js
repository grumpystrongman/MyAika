import { getPolicy } from "./policyLoader.js";
import { classifyAction } from "./classifier.js";
import { scoreRisk } from "./risk.js";
import { detectSecrets } from "./redact.js";
import { getKillSwitchState, isAllowedWhenKillSwitchActive } from "./killSwitch.js";

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function matchesGlob(filePath, pattern) {
  const normalizedPath = normalizePath(filePath).toLowerCase();
  const normalizedPattern = normalizePath(pattern).toLowerCase();
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(normalizedPath);
}

function hitsProtectedPath(resourceRefs, protectedPaths) {
  const refs = Array.isArray(resourceRefs) ? resourceRefs : [];
  const patterns = Array.isArray(protectedPaths) ? protectedPaths : [];
  for (const ref of refs) {
    for (const pattern of patterns) {
      if (matchesGlob(ref, pattern)) return true;
    }
  }
  return false;
}

function hasBrowserPasswordStoreAccess(params = {}) {
  const raw = JSON.stringify(params || {}).toLowerCase();
  return raw.includes("password") && raw.includes("chrome://") || raw.includes("passwords.google.com");
}

function isSafetyPath(resourceRefs) {
  return resourceRefs.some(ref => normalizePath(ref).includes("/apps/server/src/safety/") || normalizePath(ref).endsWith("/config/policy.json"));
}

function isLoggingDisable(params = {}) {
  const raw = JSON.stringify(params || {}).toLowerCase();
  return raw.includes("disable logging") || raw.includes("disable audit") || raw.includes("audit.log") && raw.includes("delete");
}

function actionInList(actionType, list = []) {
  return list.includes(actionType);
}

function isMemoryWriteDenied(params, policy) {
  const tier = Number(params?.tier ?? 1);
  if (Number.isFinite(tier) && tier >= 4) {
    const allowPhiWrite = policy?.memory_tiers?.tier4?.allow_write === true;
    if (!allowPhiWrite) return true;
  }
  if (detectSecrets(params?.content || "") && tier < 3) return true;
  return false;
}

function domainBlocked(domains, policy) {
  const blocklist = (policy?.network_rules?.blocklist_domains || []).map(domain => String(domain || "").toLowerCase());
  return domains.some(domain => blocklist.includes(String(domain || "").toLowerCase()));
}

function domainUnknown(domains, policy) {
  const allowlist = (policy?.network_rules?.allowlist_domains || []).map(domain => String(domain || "").toLowerCase());
  if (!domains.length) return false;
  if (!allowlist.length) return policy?.network_rules?.require_approval_for_new_domains;
  return domains.some(domain => !allowlist.includes(String(domain || "").toLowerCase()));
}

export function evaluateAction({ actionType, params = {}, outboundTargets = [], resourceRefs = [] } = {}) {
  const policy = getPolicy();
  const killState = getKillSwitchState();
  const classification = classifyAction({ actionType, params, outboundTargets });
  const refs = Array.isArray(resourceRefs) && resourceRefs.length
    ? resourceRefs
    : (classification.resourceRefs || []);
  const protectedHit = hitsProtectedPath(refs, policy.protected_paths || []);
  const unknownDomain = domainUnknown(classification.outboundDomains || [], policy);
  const riskScore = scoreRisk({
    actionType,
    sensitivity: classification.sensitivity,
    outboundDomains: classification.outboundDomains,
    protectedPathHit: protectedHit,
    unknownDomain
  });

  if (killState.enabled && !isAllowedWhenKillSwitchActive(actionType)) {
    return {
      decision: "deny",
      reason: "kill_switch_active",
      riskScore,
      classification
    };
  }

  if (!actionInList(actionType, policy.allow_actions || [])) {
    return {
      decision: "deny",
      reason: "action_not_allowlisted",
      riskScore,
      classification
    };
  }

  if (actionInList(actionType, policy.absolute_prohibitions || [])) {
    return {
      decision: "deny",
      reason: "absolute_prohibition",
      riskScore,
      classification
    };
  }

  if (hasBrowserPasswordStoreAccess(params)) {
    return {
      decision: "deny",
      reason: "browser_password_store",
      riskScore,
      classification
    };
  }

  if (isSafetyPath(refs) && (actionType.startsWith("file.") || actionType === "system.modify")) {
    return {
      decision: "deny",
      reason: "self_modify_safety",
      riskScore,
      classification
    };
  }

  if (isLoggingDisable(params)) {
    return {
      decision: "deny",
      reason: "disable_logging",
      riskScore,
      classification
    };
  }

  if (actionType === "memory.write" && isMemoryWriteDenied(params, policy)) {
    return {
      decision: "deny",
      reason: "memory_tier_policy",
      riskScore,
      classification
    };
  }

  if (domainBlocked(classification.outboundDomains || [], policy)) {
    return {
      decision: "deny",
      reason: "domain_blocked",
      riskScore,
      classification
    };
  }

  const requiresApproval =
    actionInList(actionType, policy.requires_approval || []) ||
    protectedHit ||
    (unknownDomain && policy?.network_rules?.require_approval_for_new_domains) ||
    riskScore >= Number(policy.risk_threshold || 60) ||
    (classification.sensitivity?.phi && actionType !== "memory.read");

  if (requiresApproval) {
    return {
      decision: "require_approval",
      reason: "policy_requires_approval",
      riskScore,
      classification
    };
  }

  return {
    decision: "allow",
    reason: "policy_allow",
    riskScore,
    classification
  };
}
