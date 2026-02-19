import { listGmailPreview } from "../connectors/gmail.js";
import { listOutlookPreview } from "../connectors/outlook.js";
import { scheduleEmailFollowUp } from "./emailActions.js";
import { getProvider, setProvider } from "../../integrations/store.js";

const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_LIMIT = 40;
const DEFAULT_FOLLOWUP_DAYS = 2;
const DEFAULT_REMINDER_OFFSET_HOURS = 4;
const DEFAULT_DEDUP_HOURS = 72;
const DEFAULT_MAX_PROCESSED = 400;

function parseList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractEmailAddress(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const match = text.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) return emailMatch[0];
  return text;
}

function normalizeSender(raw) {
  return extractEmailAddress(raw).toLowerCase();
}

function matchSender(raw, senderRules = []) {
  if (!senderRules.length) return false;
  const sender = normalizeSender(raw);
  if (!sender) return false;
  return senderRules.some(rule => {
    const normalized = String(rule || "").trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith("@")) return sender.endsWith(normalized);
    if (normalized.includes("@")) return sender === normalized;
    return sender.includes(normalized);
  });
}

function matchLabel(labelIds = [], configured = []) {
  if (!configured.length) return true;
  const set = new Set(labelIds.map(label => String(label || "").toLowerCase()));
  return configured.some(label => set.has(String(label || "").toLowerCase()));
}

function matchFolder(folderId = "", configured = []) {
  if (!configured.length) return true;
  return configured.some(item => String(item || "").toLowerCase() === String(folderId || "").toLowerCase());
}

function providerHasRules(providerRules = {}) {
  const senderCount = providerRules.senders?.length || 0;
  const labelCount = providerRules.labelIds?.length || 0;
  const folderCount = providerRules.folderIds?.length || 0;
  return senderCount + labelCount + folderCount > 0;
}

export function matchEmailRule(provider, email, rules) {
  const providerRules = rules?.providers?.[provider];
  if (!providerRules || !providerHasRules(providerRules)) return false;
  const senderRequired = (providerRules.senders?.length || 0) > 0;
  const labelRequired = (providerRules.labelIds?.length || 0) > 0;
  const folderRequired = (providerRules.folderIds?.length || 0) > 0;

  if (senderRequired && !matchSender(email?.from, providerRules.senders)) return false;
  if (labelRequired && !matchLabel(email?.labelIds || [], providerRules.labelIds)) return false;
  if (folderRequired && !matchFolder(email?.folderId || "", providerRules.folderIds)) return false;
  return true;
}

export function getEmailRulesConfig() {
  const enabled = String(process.env.EMAIL_RULES_ENABLED || "0") === "1";
  const lookbackDays = toNumber(process.env.EMAIL_RULES_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS);
  const limit = toNumber(process.env.EMAIL_RULES_LIMIT, DEFAULT_LIMIT);
  const followUpDays = toNumber(process.env.EMAIL_RULES_FOLLOWUP_DAYS, DEFAULT_FOLLOWUP_DAYS);
  const followUpHours = toNumber(process.env.EMAIL_RULES_FOLLOWUP_HOURS, 0);
  const reminderOffsetHours = toNumber(process.env.EMAIL_RULES_REMINDER_OFFSET_HOURS, DEFAULT_REMINDER_OFFSET_HOURS);
  const dedupHours = toNumber(process.env.EMAIL_RULES_DEDUP_HOURS, DEFAULT_DEDUP_HOURS);
  const maxProcessed = toNumber(process.env.EMAIL_RULES_MAX_PROCESSED, DEFAULT_MAX_PROCESSED);
  return {
    enabled,
    lookbackDays,
    limit,
    followUpDays,
    followUpHours,
    reminderOffsetHours,
    dedupHours,
    maxProcessed,
    priority: String(process.env.EMAIL_RULES_PRIORITY || "medium"),
    listId: String(process.env.EMAIL_RULES_LIST_ID || "").trim(),
    tags: parseList(process.env.EMAIL_RULES_TAGS),
    providers: {
      gmail: {
        senders: parseList(process.env.EMAIL_RULES_GMAIL_SENDERS),
        labelIds: parseList(process.env.EMAIL_RULES_GMAIL_LABEL_IDS)
      },
      outlook: {
        senders: parseList(process.env.EMAIL_RULES_OUTLOOK_SENDERS),
        folderIds: parseList(process.env.EMAIL_RULES_OUTLOOK_FOLDER_IDS)
      }
    }
  };
}

function computeFollowUpTimes(baseTime, config) {
  const base = baseTime ? new Date(baseTime) : new Date();
  const followUpMs = config.followUpHours && config.followUpHours > 0
    ? config.followUpHours * 3600000
    : config.followUpDays * 86400000;
  const followUpAt = new Date(base.getTime() + followUpMs).toISOString();
  let reminderAt = null;
  if (config.reminderOffsetHours && config.reminderOffsetHours > 0) {
    const reminderMs = config.reminderOffsetHours * 3600000;
    reminderAt = new Date(new Date(followUpAt).getTime() - reminderMs).toISOString();
  }
  return { followUpAt, reminderAt };
}

function makeKey(provider, email) {
  if (email?.id) return `${provider}:${email.id}`;
  const pieces = [email?.subject || "", email?.from || "", email?.receivedAt || "", email?.snippet || ""]
    .map(part => String(part || "").trim())
    .filter(Boolean);
  return `${provider}:${pieces.join("|")}`;
}

function loadRuleState(userId = "local") {
  const stored = getProvider("email_rules", userId);
  if (stored?.version === 1) return stored;
  return { version: 1, processed: {}, lastRunAt: null };
}

function pruneProcessed(entries, dedupMs, maxEntries) {
  const now = Date.now();
  const cleaned = Object.entries(entries || {})
    .filter(([, ts]) => typeof ts === "number" && now - ts < dedupMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntries);
  return Object.fromEntries(cleaned);
}

export async function runEmailRules({ userId = "local", providers = ["gmail", "outlook"], lookbackDays, config, fetchers = {}, scheduleFollowUpFn } = {}) {
  const rules = config || getEmailRulesConfig();
  if (!rules.enabled) return { ok: false, disabled: true };
  const effectiveLookback = Number.isFinite(lookbackDays) ? Number(lookbackDays) : rules.lookbackDays;
  const state = loadRuleState(userId);
  const summary = { ok: true, created: 0, skipped: 0, matched: 0, providers: {}, errors: [] };
  const dedupMs = rules.dedupHours * 3600000;
  const maxProcessed = Math.max(100, rules.maxProcessed);

  for (const provider of providers) {
    const providerRules = rules.providers?.[provider] || {};
    if (!providerHasRules(providerRules)) continue;
    const providerState = state.processed?.[provider] || {};
    const listFn = provider === "gmail"
      ? (fetchers.gmail || listGmailPreview)
      : (fetchers.outlook || listOutlookPreview);
    let items = [];
    try {
      if (provider === "gmail") {
        items = await listFn({
          userId,
          limit: rules.limit,
          lookbackDays: effectiveLookback,
          labelIds: providerRules.labelIds
        });
      } else {
        items = await listFn({
          userId,
          limit: rules.limit,
          lookbackDays: effectiveLookback,
          folderIds: providerRules.folderIds
        });
      }
    } catch (err) {
      summary.errors.push({ provider, error: err?.message || "rule_fetch_failed" });
      continue;
    }

    let processed = 0;
    let matched = 0;
    for (const email of items || []) {
      if (!matchEmailRule(provider, email, rules)) continue;
      matched += 1;
      const key = makeKey(provider, email);
      const seenAt = providerState[key];
      if (seenAt && Date.now() - seenAt < dedupMs) {
        summary.skipped += 1;
        continue;
      }
      const { followUpAt, reminderAt } = computeFollowUpTimes(email?.receivedAt || "", rules);
      try {
        const followUpFn = scheduleFollowUpFn || scheduleEmailFollowUp;
        await followUpFn({
          email,
          followUpAt,
          reminderAt,
          priority: rules.priority || "medium",
          tags: ["auto-followup", ...rules.tags],
          listId: rules.listId || null,
          notes: "Auto-created from email rule"
        }, { userId });
        providerState[key] = Date.now();
        summary.created += 1;
        processed += 1;
      } catch (err) {
        summary.errors.push({ provider, id: email?.id || "", error: err?.message || "followup_failed" });
      }
    }

    state.processed[provider] = pruneProcessed(providerState, dedupMs, maxProcessed);
    summary.providers[provider] = { matched, created: processed };
    summary.matched += matched;
  }

  state.lastRunAt = new Date().toISOString();
  setProvider("email_rules", state, userId);
  return summary;
}

let rulesTimer = null;

export function startEmailRulesLoop() {
  if (rulesTimer) return;
  const config = getEmailRulesConfig();
  if (!config.enabled) return;
  const intervalMinutes = toNumber(process.env.EMAIL_RULES_INTERVAL_MINUTES, 0);
  const runOnStartup = String(process.env.EMAIL_RULES_ON_STARTUP || "0") === "1";
  if (!intervalMinutes || intervalMinutes <= 0) {
    if (runOnStartup) runEmailRules().catch(() => {});
    return;
  }
  const intervalMs = Math.max(60000, intervalMinutes * 60_000);
  rulesTimer = setInterval(() => {
    runEmailRules().catch(() => {});
  }, intervalMs);
  if (runOnStartup) runEmailRules().catch(() => {});
}

export function getEmailRulesStatus(userId = "local") {
  const state = loadRuleState(userId);
  const config = getEmailRulesConfig();
  return {
    enabled: config.enabled,
    lastRunAt: state.lastRunAt || null,
    providers: Object.keys(config.providers || {})
  };
}
