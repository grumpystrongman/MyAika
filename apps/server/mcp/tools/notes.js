import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const notesFile = path.join(repoRoot, "data", "skills", "notes.jsonl");

function ensureDir() {
  const dir = path.dirname(notesFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function createNote(text) {
  ensureDir();
  const item = { id: Date.now().toString(36), text: String(text || ""), createdAt: new Date().toISOString() };
  fs.appendFileSync(notesFile, JSON.stringify(item) + "\n");
  return item;
}

export function searchNotes(query, limit = 10) {
  if (!fs.existsSync(notesFile)) return [];
  const lines = fs.readFileSync(notesFile, "utf-8").split(/\r?\n/).filter(Boolean);
  const parsed = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  if (!query) return parsed.slice(-limit).reverse();
  const q = query.toLowerCase();
  return parsed.filter(n => String(n.text || "").toLowerCase().includes(q)).slice(0, limit);
}

