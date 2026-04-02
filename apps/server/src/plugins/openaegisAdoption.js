import fs from "node:fs";
import path from "node:path";

const VALID_EVENT_TYPES = new Set(["install", "activate", "retained", "churn"]);
const ADOPTION_RELATIVE_DIR = path.join("data", "plugins", "_adoption");

function resolveRepoRoot(cwd = process.cwd()) {
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = {}) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function adoptionDir(repoRoot) {
  return path.join(repoRoot, ADOPTION_RELATIVE_DIR);
}

function adoptionEventsPath(repoRoot) {
  return path.join(adoptionDir(repoRoot), "events.jsonl");
}

function pluginManifestPath(repoRoot, pluginId) {
  return path.join(repoRoot, "data", "plugins", pluginId, "manifest.json");
}

function listPluginManifestFiles(repoRoot) {
  const pluginsDir = path.join(repoRoot, "data", "plugins");
  if (!fs.existsSync(pluginsDir)) return [];
  return fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== "_adoption")
    .map(entry => path.join(pluginsDir, entry.name, "manifest.json"))
    .filter(filePath => fs.existsSync(filePath));
}

function parseEvents(repoRoot) {
  const filePath = adoptionEventsPath(repoRoot);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // ignore malformed lines
    }
  }
  return events;
}

function appendEvent(repoRoot, event) {
  ensureDir(adoptionDir(repoRoot));
  fs.appendFileSync(adoptionEventsPath(repoRoot), `${JSON.stringify(event)}\n`, "utf8");
}

function normalizeManifestAdoption(manifest = {}) {
  const adoption = manifest.adoption || {};
  const metrics = adoption.metrics || {};
  const targets = adoption.targets || {};
  return {
    ...adoption,
    targets: {
      weeklyInstalls: toNumberOrZero(targets.weeklyInstalls || 0),
      weeklyActivations: toNumberOrZero(targets.weeklyActivations || 0),
      weeklyRetention: toNumberOrZero(targets.weeklyRetention || 0)
    },
    metrics: {
      installsTotal: toNumberOrZero(metrics.installsTotal || 0),
      activationsTotal: toNumberOrZero(metrics.activationsTotal || 0),
      retainedTotal: toNumberOrZero(metrics.retainedTotal || 0),
      churnTotal: toNumberOrZero(metrics.churnTotal || 0),
      activeWorkspacesEstimate: toNumberOrZero(metrics.activeWorkspacesEstimate || 0),
      lastEventAt: metrics.lastEventAt || null
    },
    tracking: {
      ...(adoption.tracking || {}),
      eventsPath: "data/plugins/_adoption/events.jsonl",
      summaryCadence: "weekly"
    }
  };
}

function updateMetrics(metrics = {}, eventType = "") {
  const next = { ...metrics };
  if (eventType === "install") next.installsTotal += 1;
  if (eventType === "activate") next.activationsTotal += 1;
  if (eventType === "retained") next.retainedTotal += 1;
  if (eventType === "churn") next.churnTotal += 1;
  next.activeWorkspacesEstimate = Math.max(next.installsTotal - next.churnTotal, 0);
  return next;
}

function weekWindow({ startAt = "", endAt = "" } = {}) {
  const end = endAt ? new Date(endAt) : new Date();
  if (Number.isNaN(end.getTime())) throw new Error("invalid_endAt");
  const start = startAt ? new Date(startAt) : new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000));
  if (Number.isNaN(start.getTime())) throw new Error("invalid_startAt");
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function recordAdoptionEvent({
  repoRoot = resolveRepoRoot(),
  pluginId,
  eventType,
  hostId = "",
  workspaceId = "",
  source = "manual",
  at = ""
} = {}) {
  const normalizedPluginId = normalizeId(pluginId);
  const normalizedEventType = normalizeId(eventType);
  if (!normalizedPluginId) throw new Error("plugin_id_required");
  if (!VALID_EVENT_TYPES.has(normalizedEventType)) throw new Error("invalid_event_type");
  const manifestFile = pluginManifestPath(repoRoot, normalizedPluginId);
  if (!fs.existsSync(manifestFile)) throw new Error("plugin_not_found");

  const manifest = readJson(manifestFile, {});
  manifest.adoption = normalizeManifestAdoption(manifest);
  const timestamp = at ? new Date(at).toISOString() : nowIso();
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pluginId: normalizedPluginId,
    hostId: normalizeId(hostId || manifest.partnerHost?.id || ""),
    eventType: normalizedEventType,
    workspaceId: normalizeId(workspaceId || ""),
    source,
    at: timestamp
  };
  appendEvent(repoRoot, event);
  manifest.adoption.metrics = updateMetrics(manifest.adoption.metrics, normalizedEventType);
  manifest.adoption.metrics.lastEventAt = timestamp;
  manifest.updatedAt = nowIso();
  writeJson(manifestFile, manifest);

  return { event, metrics: manifest.adoption.metrics, manifestFile };
}

export function buildWeeklyAdoptionSummary({
  repoRoot = resolveRepoRoot(),
  startAt = "",
  endAt = "",
  pluginId = "",
  hostId = ""
} = {}) {
  const window = weekWindow({ startAt, endAt });
  const startMs = new Date(window.startAt).getTime();
  const endMs = new Date(window.endAt).getTime();
  const wantedPluginId = normalizeId(pluginId);
  const wantedHostId = normalizeId(hostId);

  const manifests = listPluginManifestFiles(repoRoot).map(filePath => readJson(filePath, {}));
  const manifestMap = new Map(
    manifests
      .filter(manifest => manifest.id)
      .map(manifest => [normalizeId(manifest.id), manifest])
  );

  const events = parseEvents(repoRoot).filter(event => {
    const time = new Date(event.at).getTime();
    if (!Number.isFinite(time) || time < startMs || time > endMs) return false;
    const eventPluginId = normalizeId(event.pluginId);
    const eventHostId = normalizeId(event.hostId);
    if (wantedPluginId && eventPluginId !== wantedPluginId) return false;
    if (wantedHostId && eventHostId !== wantedHostId) return false;
    return true;
  });

  const rowsByPlugin = new Map();
  for (const event of events) {
    const id = normalizeId(event.pluginId);
    const row = rowsByPlugin.get(id) || {
      pluginId: id,
      hostId: normalizeId(event.hostId || ""),
      installs: 0,
      activations: 0,
      retained: 0,
      churn: 0
    };
    if (event.eventType === "install") row.installs += 1;
    if (event.eventType === "activate") row.activations += 1;
    if (event.eventType === "retained") row.retained += 1;
    if (event.eventType === "churn") row.churn += 1;
    rowsByPlugin.set(id, row);
  }

  const rowList = [];
  const seedRows = wantedPluginId ? [wantedPluginId] : [...new Set([...manifestMap.keys(), ...rowsByPlugin.keys()])];
  for (const id of seedRows) {
    const row = rowsByPlugin.get(id) || {
      pluginId: id,
      hostId: normalizeId(manifestMap.get(id)?.partnerHost?.id || ""),
      installs: 0,
      activations: 0,
      retained: 0,
      churn: 0
    };
    const manifest = manifestMap.get(id) || {};
    const adoption = normalizeManifestAdoption(manifest);
    if (wantedHostId && normalizeId(row.hostId || manifest.partnerHost?.id || "") !== wantedHostId) continue;
    const conversionRate = row.installs > 0 ? row.activations / row.installs : 0;
    rowList.push({
      pluginId: id,
      pluginName: manifest.name || id,
      hostId: normalizeId(row.hostId || manifest.partnerHost?.id || ""),
      installs: row.installs,
      activations: row.activations,
      retained: row.retained,
      churn: row.churn,
      conversionRate,
      installTarget: adoption.targets.weeklyInstalls,
      activationTarget: adoption.targets.weeklyActivations,
      retentionTarget: adoption.targets.weeklyRetention,
      lifetimeMetrics: adoption.metrics
    });
  }

  rowList.sort((a, b) => b.installs - a.installs || b.activations - a.activations || a.pluginId.localeCompare(b.pluginId));
  return {
    window,
    totals: {
      installs: rowList.reduce((sum, row) => sum + row.installs, 0),
      activations: rowList.reduce((sum, row) => sum + row.activations, 0),
      retained: rowList.reduce((sum, row) => sum + row.retained, 0),
      churn: rowList.reduce((sum, row) => sum + row.churn, 0)
    },
    rows: rowList
  };
}

export function formatWeeklyAdoptionSummary(summary) {
  const lines = [];
  lines.push(`Window: ${summary.window.startAt} -> ${summary.window.endAt}`);
  lines.push(`Totals | installs=${summary.totals.installs} activations=${summary.totals.activations} retained=${summary.totals.retained} churn=${summary.totals.churn}`);
  lines.push("Plugin breakdown:");
  for (const row of summary.rows) {
    const conversionPct = (row.conversionRate * 100).toFixed(1);
    lines.push(
      `- ${row.pluginId} (${row.hostId || "unknown"}) installs=${row.installs}/${row.installTarget || 0} activations=${row.activations}/${row.activationTarget || 0} retained=${row.retained}/${row.retentionTarget || 0} churn=${row.churn} conversion=${conversionPct}%`
    );
  }
  if (!summary.rows.length) lines.push("- no matching plugin events in this window");
  return `${lines.join("\n")}\n`;
}

