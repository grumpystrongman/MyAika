import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const holdsFile = path.join(repoRoot, "data", "calendar_holds.json");

function ensureDir() {
  const dir = path.dirname(holdsFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadHolds() {
  try {
    if (!fs.existsSync(holdsFile)) return [];
    return JSON.parse(fs.readFileSync(holdsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveHolds(items) {
  ensureDir();
  fs.writeFileSync(holdsFile, JSON.stringify(items, null, 2));
}

export function proposeHold({ title, start, end, attendees = [] }) {
  const items = loadHolds();
  const hold = {
    id: Date.now().toString(36),
    title: title || "Hold",
    start,
    end,
    attendees,
    status: "draft",
    createdAt: new Date().toISOString()
  };
  items.push(hold);
  saveHolds(items);
  return hold;
}

