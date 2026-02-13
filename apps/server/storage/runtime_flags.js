import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "runtime_flags.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function getRuntimeFlags() {
  try {
    if (!fs.existsSync(storePath)) return {};
    const raw = fs.readFileSync(storePath, "utf-8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setRuntimeFlag(key, value) {
  const flags = getRuntimeFlags();
  flags[key] = value;
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(flags, null, 2));
  return flags;
}

export function clearRuntimeFlag(key) {
  const flags = getRuntimeFlags();
  delete flags[key];
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(flags, null, 2));
  return flags;
}
