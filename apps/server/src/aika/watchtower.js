import { readConfigList } from "./config.js";
import { createWatchItem, updateWatchItem, listWatchItems, getWatchItem } from "../../storage/watch_items.js";
import { createWatchEvent, listWatchEvents } from "../../storage/watch_events.js";
import { appendAuditEvent } from "../safety/auditLog.js";

const WATCH_CONFIG = "aika_watchtower_templates.json";

function nowIso() {
  return new Date().toISOString();
}

export function loadWatchTemplates() {
  return readConfigList(WATCH_CONFIG);
}

export function getWatchTemplate(idOrName = "") {
  const normalized = String(idOrName || "").trim().toLowerCase();
  const templates = loadWatchTemplates();
  return templates.find(t => String(t.id || "").toLowerCase() === normalized)
    || templates.find(t => String(t.name || "").toLowerCase() === normalized)
    || null;
}

function deriveSignal(rawInput) {
  if (rawInput == null) return { value: null };
  if (typeof rawInput === "number") return { value: rawInput };
  if (typeof rawInput === "string") {
    const numeric = Number(rawInput);
    if (Number.isFinite(numeric)) return { value: numeric };
    return { value: rawInput };
  }
  if (typeof rawInput === "object") {
    if (Number.isFinite(rawInput.value)) return { value: rawInput.value };
    return { value: rawInput };
  }
  return { value: rawInput };
}

function computeDiff(prevSignal, nextSignal) {
  if (!prevSignal) return { change: null };
  const prevValue = prevSignal.value;
  const nextValue = nextSignal.value;
  if (Number.isFinite(prevValue) && Number.isFinite(nextValue)) {
    const delta = nextValue - prevValue;
    const pct = prevValue !== 0 ? delta / prevValue : null;
    return { delta, pct_change: pct };
  }
  if (typeof prevValue === "object" && typeof nextValue === "object") {
    const prevKeys = new Set(Object.keys(prevValue || {}));
    const nextKeys = new Set(Object.keys(nextValue || {}));
    const added = Array.from(nextKeys).filter(k => !prevKeys.has(k));
    const removed = Array.from(prevKeys).filter(k => !nextKeys.has(k));
    return { added, removed };
  }
  return { change: nextValue !== prevValue ? "changed" : "same" };
}

function classifySeverity(diff, thresholds = {}) {
  if (!diff) return "low";
  if (Number.isFinite(diff.pct_change)) {
    const absPct = Math.abs(diff.pct_change);
    if (thresholds.pct_critical && absPct >= thresholds.pct_critical) return "high";
    if (thresholds.pct_warn && absPct >= thresholds.pct_warn) return "medium";
    return absPct > 0 ? "low" : "info";
  }
  if (Array.isArray(diff.added) || Array.isArray(diff.removed)) {
    const changeCount = (diff.added?.length || 0) + (diff.removed?.length || 0);
    if (thresholds.change_count_critical && changeCount >= thresholds.change_count_critical) return "high";
    if (thresholds.change_count_warn && changeCount >= thresholds.change_count_warn) return "medium";
    return changeCount > 0 ? "low" : "info";
  }
  if (diff.change === "changed") return "low";
  return "info";
}

function summarizeEvent(type, diff) {
  if (Number.isFinite(diff?.pct_change)) {
    const pct = (diff.pct_change * 100).toFixed(1);
    return `${type} shifted by ${pct}%`;
  }
  if (Array.isArray(diff?.added) || Array.isArray(diff?.removed)) {
    const added = diff.added?.length || 0;
    const removed = diff.removed?.length || 0;
    return `${type} changed (${added} added, ${removed} removed).`;
  }
  return `${type} update detected.`;
}

export function createWatchItemFromTemplate({ templateId, userId = "local", config = {} } = {}) {
  const template = getWatchTemplate(templateId);
  if (!template) return null;
  return createWatchItem({
    userId,
    type: template.type || template.id,
    config: { ...(template.config || {}), ...(config || {}), templateId: template.id || "" },
    cadence: template.cadence || "daily",
    thresholds: template.thresholds || {},
    enabled: true
  });
}

export function observeWatchItem({ watchItemId, rawInput, userId = "local" } = {}) {
  const watchItem = getWatchItem(watchItemId);
  if (!watchItem) return { status: "error", error: "watch_item_not_found" };
  const derivedSignal = deriveSignal(rawInput);
  const previousEvents = listWatchEvents({ watchItemId, limit: 1 });
  const prevSignal = previousEvents[0]?.derivedSignal || null;
  const diff = computeDiff(prevSignal, derivedSignal);
  const severity = classifySeverity(diff, watchItem.thresholds || {});
  const summary = summarizeEvent(watchItem.type || "watch", diff);
  const event = createWatchEvent({
    watchItemId,
    observedAt: nowIso(),
    rawInput,
    derivedSignal,
    severity,
    summary,
    diff
  });
  updateWatchItem(watchItemId, { lastObservedAt: nowIso() });
  appendAuditEvent({
    action_type: "watch.observe",
    decision: severity,
    reason: watchItem.type || "",
    user: userId,
    redacted_payload: { watchItemId },
    result_redacted: { summary, severity }
  });
  return { status: "ok", event, watchItem };
}

export function listWatchtowerItems({ userId = "local", enabledOnly = false } = {}) {
  return listWatchItems({ userId, enabledOnly });
}
