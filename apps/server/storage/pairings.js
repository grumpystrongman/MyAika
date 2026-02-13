import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "pairings.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function loadStore() {
  try {
    if (!fs.existsSync(storePath)) return { pending: [], allowlist: {} };
    const raw = fs.readFileSync(storePath, "utf8");
    return raw ? JSON.parse(raw) : { pending: [], allowlist: {} };
  } catch {
    return { pending: [], allowlist: {} };
  }
}

function saveStore(store) {
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function listPairings() {
  return loadStore();
}

export function isSenderAllowed(channel, senderId) {
  const store = loadStore();
  return Boolean(store.allowlist?.[channel]?.[senderId]);
}

export function getAllowedSender(channel, senderId) {
  const store = loadStore();
  return store.allowlist?.[channel]?.[senderId] || null;
}

export function createPairingRequest({ channel, senderId, senderName, workspaceId, preview }) {
  const store = loadStore();
  const existing = store.pending.find(p => p.channel === channel && p.senderId === senderId);
  if (existing) return existing;
  const request = {
    id: crypto.randomUUID(),
    channel,
    senderId,
    senderName: senderName || "",
    workspaceId: workspaceId || "default",
    code: generateCode(),
    preview: preview || "",
    status: "pending",
    createdAt: nowIso()
  };
  store.pending.push(request);
  saveStore(store);
  return request;
}

export function approvePairing(id, approvedBy = "user") {
  const store = loadStore();
  const idx = store.pending.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const request = store.pending.splice(idx, 1)[0];
  if (!store.allowlist[request.channel]) store.allowlist[request.channel] = {};
  store.allowlist[request.channel][request.senderId] = {
    senderName: request.senderName,
    workspaceId: request.workspaceId,
    approvedAt: nowIso(),
    approvedBy
  };
  saveStore(store);
  return store.allowlist[request.channel][request.senderId];
}

export function denyPairing(id) {
  const store = loadStore();
  const idx = store.pending.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const [request] = store.pending.splice(idx, 1);
  saveStore(store);
  return request;
}

export function recordPairingUse(channel, senderId) {
  const store = loadStore();
  const entry = store.allowlist?.[channel]?.[senderId];
  if (!entry) return null;
  entry.lastUsedAt = nowIso();
  saveStore(store);
  return entry;
}
