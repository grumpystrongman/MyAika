import { getAssistantProfile } from "../../storage/assistant_profile.js";
import { normalizeRecipients } from "../email/emailActions.js";

function normalizeEmailList(value) {
  if (!value) return [];
  return normalizeRecipients(value);
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

export function evaluateAutonomy({ actionType, params = {}, context = {}, policy, classification, riskScore } = {}) {
  if (!actionType) return null;
  const autonomyLevel = String(policy?.autonomy_level || "supervised");
  if (autonomyLevel === "assistive_only") return null;

  if (actionType !== "email.send") return null;

  const autonomyFlag = normalizeAutonomyFlag(params.autonomy);
  if (!autonomyFlag) return null;
  if (!["self", "self_email", "self_reminder"].includes(autonomyFlag)) return null;

  const to = normalizeEmailList(params.sendTo || params.to || []);
  const cc = normalizeEmailList(params.cc || []);
  const bcc = normalizeEmailList(params.bcc || []);
  if (!to.length) return { allow: false, reason: "autonomy_no_recipients" };
  if (cc.length || bcc.length) return { allow: false, reason: "autonomy_cc_bcc_not_allowed" };

  const identity = getIdentity(context?.userId);
  const allowed = buildAllowedEmails(identity);
  if (!allowed.size) return { allow: false, reason: "autonomy_identity_missing" };
  const allAllowed = to.every(address => allowed.has(String(address).toLowerCase()));
  if (!allAllowed) return { allow: false, reason: "autonomy_recipient_not_allowed" };

  return { allow: true, reason: "autonomy_self_email", details: { to } };
}
