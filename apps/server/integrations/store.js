import fs from "node:fs";
import path from "node:path";
import { encryptString, decryptString } from "../storage/memory_crypto.js";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "integrations.json");
const SENSITIVE_PROVIDERS = new Set([
  "google",
  "slack",
  "telegram",
  "discord",
  "meta",
  "facebook",
  "instagram",
  "whatsapp"
]);

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

function wrapSensitive(provider, value) {
  if (!SENSITIVE_PROVIDERS.has(provider) || value === null || value === undefined) return value;
  const payload = encryptString(JSON.stringify(value));
  return { __enc: true, payload };
}

function unwrapSensitive(provider, value) {
  if (!SENSITIVE_PROVIDERS.has(provider)) return value;
  if (value && value.__enc && value.payload) {
    try {
      const decrypted = decryptString(value.payload);
      return decrypted ? JSON.parse(decrypted) : null;
    } catch {
      return null;
    }
  }
  return value;
}

export function getProvider(provider, userId = "") {
  const store = readStore();
  if (userId) {
    return unwrapSensitive(provider, store.users?.[userId]?.[provider]) || null;
  }
  return unwrapSensitive(provider, store[provider]) || null;
}

export function setProvider(provider, value, userId = "") {
  const store = readStore();
  if (userId) {
    if (!store.users) store.users = {};
    if (!store.users[userId]) store.users[userId] = {};
    if (value === null) {
      delete store.users[userId][provider];
    } else {
      store.users[userId][provider] = wrapSensitive(provider, value);
    }
    writeStore(store);
    return value || null;
  }
  store[provider] = wrapSensitive(provider, value);
  writeStore(store);
  return value || null;
}
