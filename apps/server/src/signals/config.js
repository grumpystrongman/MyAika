import fs from "node:fs";
import path from "node:path";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const candidate = path.join(cwd, "apps", "server");
  if (fs.existsSync(candidate)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const defaultConfigPath = path.join(repoRoot, "config", "signals_sources.json");

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    if (String(err?.code || "") === "ENOENT") return null;
    throw err;
  }
}

function normalizeDefaults(defaults = {}) {
  return {
    language: defaults.language || "en",
    maxItemsPerFeed: Number(defaults.maxItemsPerFeed || 40),
    maxDocChars: Number(defaults.maxDocChars || 50000),
    fetchTimeoutMs: Number(defaults.fetchTimeoutMs || 15000),
    requestDelayMs: Number(defaults.requestDelayMs || 350),
    retry: {
      retries: Number(defaults.retry?.retries ?? 2),
      minDelayMs: Number(defaults.retry?.minDelayMs ?? 600),
      maxDelayMs: Number(defaults.retry?.maxDelayMs ?? 4000)
    },
    maxDocsPerSourcePerDay: Number(defaults.maxDocsPerSourcePerDay || 30),
    maxDocsPerClusterPerDay: Number(defaults.maxDocsPerClusterPerDay || 12),
    clusterCount: Number(defaults.clusterCount || 8),
    minClusterDocs: Number(defaults.minClusterDocs || 3),
    freshness: {
      expireThreshold: Number(defaults.freshness?.expireThreshold ?? 0.08),
      staleThreshold: Number(defaults.freshness?.staleThreshold ?? 0.22)
    },
    halfLifeHours: {
      breaking_market: Number(defaults.halfLifeHours?.breaking_market ?? 36),
      macro_regulatory: Number(defaults.halfLifeHours?.macro_regulatory ?? 168),
      environmental_outlook: Number(defaults.halfLifeHours?.environmental_outlook ?? 720),
      energy_inventory: Number(defaults.halfLifeHours?.energy_inventory ?? 240),
      environmental_hazard: Number(defaults.halfLifeHours?.environmental_hazard ?? 72),
      shipping_disruption: Number(defaults.halfLifeHours?.shipping_disruption ?? 96)
    }
  };
}

function normalizeSource(source = {}, defaults = {}) {
  const tags = Array.isArray(source.tags) ? source.tags.filter(Boolean) : [];
  return {
    id: String(source.id || "").trim(),
    type: String(source.type || "rss").trim().toLowerCase(),
    url: String(source.url || "").trim(),
    category: String(source.category || "breaking_market").trim(),
    tags,
    reliability: Number(source.reliability || 0),
    enabled: source.enabled !== false,
    allow_html: source.allow_html === true,
    maxItemsPerFeed: Number(source.maxItemsPerFeed || defaults.maxItemsPerFeed),
    language: String(source.language || defaults.language || "en")
  };
}

export function loadSignalsConfig(customPath) {
  const envPath = process.env.SIGNALS_CONFIG_PATH || "";
  const resolvedPath = customPath
    ? (path.isAbsolute(customPath) ? customPath : path.join(repoRoot, customPath))
    : (envPath ? (path.isAbsolute(envPath) ? envPath : path.join(repoRoot, envPath)) : defaultConfigPath);
  const raw = readJson(resolvedPath) || {};
  const defaults = normalizeDefaults(raw.defaults || {});
  const reliability = raw.reliability || {};
  const sources = Array.isArray(raw.sources) ? raw.sources.map(source => normalizeSource(source, defaults)).filter(s => s.id) : [];
  return {
    path: resolvedPath,
    defaults,
    reliability,
    sources
  };
}

export function resolveSourceReliability(source, reliabilityMap = {}) {
  if (!source) return 0.7;
  if (Number.isFinite(source.reliability) && source.reliability > 0) return source.reliability;
  const key = String(source.id || "").toLowerCase();
  if (key && Number.isFinite(reliabilityMap[key])) return Number(reliabilityMap[key]);
  return 0.7;
}

export function resolveSignalsConfigPath() {
  const envPath = process.env.SIGNALS_CONFIG_PATH || "";
  if (envPath) return path.isAbsolute(envPath) ? envPath : path.join(repoRoot, envPath);
  return defaultConfigPath;
}

export function getSignalsDataDir() {
  return path.join(repoRoot, "data", "signals");
}

