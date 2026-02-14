import { getRuntimeFlags, setRuntimeFlag } from "../../storage/runtime_flags.js";
import { getPolicy } from "./policyLoader.js";

const FLAG_KEY = "kill_switch";
const ALLOWED_WHEN_ACTIVE = new Set([
  "audit.view",
  "approvals.view",
  "kill_switch.disable",
  "kill_switch.status",
  "help.view"
]);

export function getKillSwitchState() {
  const flags = getRuntimeFlags();
  const stored = flags[FLAG_KEY] || {};
  return {
    enabled: Boolean(stored.enabled),
    reason: stored.reason || "",
    activatedAt: stored.activatedAt || null,
    activatedBy: stored.activatedBy || ""
  };
}

export function setKillSwitch({ enabled, reason = "", activatedBy = "" } = {}) {
  const state = {
    enabled: Boolean(enabled),
    reason: reason || "",
    activatedAt: enabled ? new Date().toISOString() : null,
    activatedBy: activatedBy || ""
  };
  setRuntimeFlag(FLAG_KEY, state);
  return state;
}

export function isKillSwitchEnabled() {
  return getKillSwitchState().enabled;
}

export function isStopPhrase(text) {
  const policy = getPolicy();
  const phrase = String(policy?.kill_switch?.stop_phrase || "Aika, stand down.").toLowerCase();
  const input = String(text || "").toLowerCase();
  return phrase && input.includes(phrase.toLowerCase());
}

export function isAllowedWhenKillSwitchActive(actionType) {
  return ALLOWED_WHEN_ACTIVE.has(String(actionType || ""));
}
