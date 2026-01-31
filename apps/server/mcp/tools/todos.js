import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const todosFile = path.join(repoRoot, "data", "skills", "todos.json");

function ensureDir() {
  const dir = path.dirname(todosFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadTodos() {
  try {
    if (!fs.existsSync(todosFile)) return [];
    return JSON.parse(fs.readFileSync(todosFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveTodos(items) {
  ensureDir();
  fs.writeFileSync(todosFile, JSON.stringify(items, null, 2));
}

export function createTodo(text) {
  const items = loadTodos();
  const item = { id: Date.now().toString(36), text: String(text || ""), done: false, createdAt: new Date().toISOString() };
  items.push(item);
  saveTodos(items);
  return item;
}

export function listTodos() {
  return loadTodos();
}

