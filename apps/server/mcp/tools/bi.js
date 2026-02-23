import { createWatchItem, getWatchItem, listWatchItems, updateWatchItem } from "../../storage/watch_items.js";
import { createWatchItemFromTemplate, observeWatchItem } from "../../src/aika/watchtower.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeMetric(value) {
  const metric = normalizeText(value);
  return metric ? metric : "";
}

function normalizeNumber(value) {
  if (value == null) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function resolveExistingWatchItem({ userId, metric }) {
  if (!metric) return null;
  const normalized = metric.toLowerCase();
  const items = listWatchItems({ userId, enabledOnly: false, limit: 200 });
  return items.find(item => String(item?.config?.metric || "").toLowerCase() === normalized) || null;
}

function resolveRawInput(params = {}, metric = "") {
  if (params.rawInput != null) return params.rawInput;
  if (params.raw_input != null) return params.raw_input;
  if (params.raw != null) return params.raw;
  if (params.value != null || metric) {
    const value = normalizeNumber(params.value);
    if (metric) return { metric, value };
    return value;
  }
  return null;
}

export function snapshot(params = {}, context = {}) {
  const userId = context.userId || "local";
  const metric = normalizeMetric(params.metric || params.name || params.kpi);
  const watchItemId = normalizeText(params.watchItemId || params.watch_item_id);
  const watchTemplateId = normalizeText(params.watchTemplateId || params.watch_template_id || params.templateId);
  const thresholds = params.thresholds && typeof params.thresholds === "object" ? params.thresholds : null;
  const cadence = params.cadence ? String(params.cadence) : null;

  let watchItem = null;
  if (watchItemId) {
    watchItem = getWatchItem(watchItemId);
    if (!watchItem) {
      const err = new Error("watch_item_not_found");
      err.status = 404;
      throw err;
    }
  }

  if (!watchItem && watchTemplateId) {
    watchItem = createWatchItemFromTemplate({ templateId: watchTemplateId, userId, config: metric ? { metric } : {} });
    if (!watchItem) {
      const err = new Error("watch_template_not_found");
      err.status = 404;
      throw err;
    }
  }

  if (!watchItem && metric) {
    watchItem = resolveExistingWatchItem({ userId, metric })
      || createWatchItem({
        userId,
        type: "kpi",
        config: { metric },
        cadence: cadence || "daily",
        thresholds: thresholds || {},
        enabled: true
      });
  }

  if (!watchItem) {
    const err = new Error("watch_item_required");
    err.status = 400;
    throw err;
  }

  if (thresholds || cadence) {
    watchItem = updateWatchItem(watchItem.id, {
      thresholds: thresholds || watchItem.thresholds,
      cadence: cadence || watchItem.cadence
    });
  }

  const rawInput = resolveRawInput(params, metric);
  const observed = observeWatchItem({ watchItemId: watchItem.id, rawInput, userId });
  return {
    status: observed.status || "ok",
    watchItem: observed.watchItem || watchItem,
    event: observed.event || null
  };
}
