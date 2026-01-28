import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "integrations.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

export function readStore() {
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeStore(data) {
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

export function getProvider(provider) {
  const store = readStore();
  return store[provider] || null;
}

export function setProvider(provider, value) {
  const store = readStore();
  store[provider] = value;
  writeStore(store);
  return store[provider];
}
