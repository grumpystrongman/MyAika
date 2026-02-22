import fs from "node:fs";
import path from "node:path";
function resolveRepoRoot() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "config"))) return cwd;
  const candidate = path.resolve(cwd, "..", "..");
  if (fs.existsSync(path.join(candidate, "config"))) return candidate;
  return cwd;
}

const repoRoot = resolveRepoRoot();

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getConfigPath(fileName) {
  return path.join(repoRoot, "config", fileName);
}

export function readConfig(fileName, fallback = null) {
  const target = getConfigPath(fileName);
  return readJson(target, fallback);
}

export function readConfigList(fileName) {
  const data = readConfig(fileName, []);
  return Array.isArray(data) ? data : [];
}

export function readMacroConfig(subdir) {
  const baseDir = path.join(repoRoot, "config", "macros", subdir);
  try {
    if (!fs.existsSync(baseDir)) return [];
    return fs.readdirSync(baseDir)
      .filter(name => name.endsWith(".json"))
      .map(name => readJson(path.join(baseDir, name), null))
      .filter(Boolean);
  } catch {
    return [];
  }
}
