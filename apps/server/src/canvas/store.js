import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "canvas.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function loadStore() {
  try {
    if (!fs.existsSync(storePath)) return { workspaces: {} };
    const raw = fs.readFileSync(storePath, "utf8");
    return raw ? JSON.parse(raw) : { workspaces: {} };
  } catch {
    return { workspaces: {} };
  }
}

function saveStore(store) {
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function listCanvasCards(workspaceId = "default") {
  const store = loadStore();
  const cards = store.workspaces?.[workspaceId]?.cards || {};
  return Object.values(cards).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function upsertCanvasCard({ workspaceId = "default", cardId, kind, content }) {
  const store = loadStore();
  if (!store.workspaces) store.workspaces = {};
  if (!store.workspaces[workspaceId]) store.workspaces[workspaceId] = { cards: {} };
  const cards = store.workspaces[workspaceId].cards;
  const existing = cards[cardId] || {};
  const record = {
    cardId,
    kind: kind || existing.kind || "note",
    content: content ?? existing.content ?? {},
    createdAt: existing.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  cards[cardId] = record;
  saveStore(store);
  return record;
}
