import { getAssistantProfile } from "../../storage/assistant_profile.js";
import { normalizeRecipients } from "../email/emailActions.js";

function normalizeEmailList(value) {
  if (!value) return [];
  return normalizeRecipients(value);
}

function parseList(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function getIdentity(userId) {
  const profile = getAssistantProfile(userId || "local");
  return profile?.preferences?.identity || {};
}

function buildAllowedEmails(identity) {
  const emails = [identity.workEmail, identity.personalEmail]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .map(value => value.toLowerCase());
  return new Set(emails);
}

function normalizeAutonomyFlag(value) {
  if (!value) return "";
  if (value === true) return "self";
  const normalized = String(value).trim().toLowerCase();
  return normalized;
}

function isEnabledFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function getAssistantTaskAutonomyConfig() {
  const allowlistRaw = process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE_ALLOWLIST || process.env.ASSISTANT_TASK_EMAIL_TO || "";
  const allowlist = new Set(parseList(allowlistRaw).map(value => value.toLowerCase()));
  const subjectPrefix = String(
    process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE_SUBJECT_PREFIX ||
    process.env.ASSISTANT_TASK_EMAIL_SUBJECT_PREFIX ||
    "Aika Task"
  ).trim();
  const requirePrefix = String(process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE_REQUIRE_PREFIX || "1") !== "0";
  return {
    enabled: isEnabledFlag(process.env.ASSISTANT_TASK_EMAIL_AUTO_APPROVE),
    allowlist,
    subjectPrefix,
    requirePrefix
  };
}

export function evaluateAutonomy({ actionType, params = {}, context = {}, policy, classification, riskScore } = {}) {
  if (!actionType) return null;
  const autonomyLevel = String(policy?.autonomy_level || "supervised");
  if (autonomyLevel === "assistive_only") return null;

  if (actionType !== "email.send") return null;

  const autonomyFlag = normalizeAutonomyFlag(params.autonomy);
  if (!autonomyFlag) return null;
  if (!["self", "self_email", "self_reminder", "assistant_task"].includes(autonomyFlag)) return null;

  const to = normalizeEmailList(params.sendTo || params.to || []);
  const cc = normalizeEmailList(params.cc || []);
  const bcc = normalizeEmailList(params.bcc || []);
  if (!to.length) return { allow: false, reason: "autonomy_no_recipients" };
  if (cc.length || bcc.length) return { allow: false, reason: "autonomy_cc_bcc_not_allowed" };

  if (autonomyFlag === "assistant_task") {
    const config = getAssistantTaskAutonomyConfig();
    if (!config.enabled) return { allow: false, reason: "assistant_task_autonomy_disabled" };
    if (String(context?.source || "").toLowerCase() !== "assistant_task") {
      return { allow: false, reason: "assistant_task_context_missing" };
    }
    if (!config.allowlist.size) return { allow: false, reason: "assistant_task_allowlist_missing" };
    const allAllowed = to.every(address => config.allowlist.has(String(address).toLowerCase()));
    if (!allAllowed) return { allow: false, reason: "assistant_task_recipient_not_allowed" };
    if (config.requirePrefix && config.subjectPrefix) {
      const subject = String(params.subject || "");
      if (!subject.startsWith(config.subjectPrefix)) {
        return { allow: false, reason: "assistant_task_subject_prefix_mismatch" };
      }
    }
    return { allow: true, reason: "autonomy_assistant_task_email", details: { to } };
  }

  const identity = getIdentity(context?.userId);
  const allowed = buildAllowedEmails(identity);
  if (!allowed.size) return { allow: false, reason: "autonomy_identity_missing" };
  const allAllowed = to.every(address => allowed.has(String(address).toLowerCase()));
  if (!allAllowed) return { allow: false, reason: "autonomy_recipient_not_allowed" };

  return { allow: true, reason: "autonomy_self_email", details: { to } };
}
