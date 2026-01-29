import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data", "skills");
const notesFile = path.join(dataDir, "notes.jsonl");
const todosFile = path.join(dataDir, "todos.json");
const configFile = path.join(dataDir, "config.json");

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const skills = [
  {
    key: "time_date",
    label: "Time & Date",
    description: "Answer questions like 'what time is it' or 'what's today's date'.",
    enabled: true
  },
  {
    key: "notes",
    label: "Quick Notes",
    description: "Save short notes and list recent notes.",
    enabled: true
  },
  {
    key: "todos",
    label: "Tasks & Todos",
    description: "Add, list, and complete simple tasks.",
    enabled: true
  },
  {
    key: "system_status",
    label: "System Status",
    description: "Report CPU, memory, uptime (local server).",
    enabled: true
  }
];

let enabledMap = null;
const events = [];

function loadConfig() {
  if (enabledMap) return enabledMap;
  ensureDir();
  const stored = safeReadJson(configFile, null);
  enabledMap = {};
  for (const skill of skills) {
    enabledMap[skill.key] =
      typeof stored?.[skill.key] === "boolean" ? stored[skill.key] : skill.enabled;
  }
  return enabledMap;
}

function saveConfig() {
  ensureDir();
  fs.writeFileSync(configFile, JSON.stringify(enabledMap, null, 2));
}

function addEvent(evt) {
  const payload = { time: nowIso(), ...evt };
  events.unshift(payload);
  if (events.length > 50) events.pop();
}

function listNotes(limit = 5) {
  if (!fs.existsSync(notesFile)) return [];
  const lines = fs.readFileSync(notesFile, "utf-8").split(/\r?\n/).filter(Boolean);
  const parsed = lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return parsed.slice(-limit).reverse();
}

function addNote(text) {
  ensureDir();
  const note = { id: Date.now().toString(36), text, createdAt: nowIso() };
  fs.appendFileSync(notesFile, `${JSON.stringify(note)}\n`);
  return note;
}

function clearNotes() {
  if (fs.existsSync(notesFile)) fs.unlinkSync(notesFile);
}

function loadTodos() {
  return safeReadJson(todosFile, []);
}

function saveTodos(items) {
  ensureDir();
  fs.writeFileSync(todosFile, JSON.stringify(items, null, 2));
}

function addTodo(text) {
  const items = loadTodos();
  const item = { id: Date.now().toString(36), text, done: false, createdAt: nowIso() };
  items.push(item);
  saveTodos(items);
  return item;
}

function completeTodo(idOrText) {
  const items = loadTodos();
  const target = idOrText?.toLowerCase?.() || "";
  let updated = null;
  for (const item of items) {
    if (item.done) continue;
    if (item.id.toLowerCase() === target || item.text.toLowerCase().includes(target)) {
      item.done = true;
      item.completedAt = nowIso();
      updated = item;
      break;
    }
  }
  if (updated) saveTodos(items);
  return updated;
}

function listTodos(showAll = false) {
  const items = loadTodos();
  return items.filter(t => (showAll ? true : !t.done)).slice(-10).reverse();
}

function formatTodos(items) {
  if (!items.length) return "No tasks yet.";
  return items
    .map(item => `- [${item.done ? "x" : " "}] (${item.id}) ${item.text}`)
    .join("\n");
}

export function getSkillsState() {
  const enabled = loadConfig();
  return skills.map(skill => ({
    ...skill,
    enabled: Boolean(enabled[skill.key])
  }));
}

export function toggleSkill(key, enabled) {
  const map = loadConfig();
  if (!(key in map)) return false;
  map[key] = Boolean(enabled);
  saveConfig();
  addEvent({ type: "toggle", skill: key, enabled: map[key] });
  return true;
}

export function getSkillEvents() {
  return events;
}

export function handleSkillMessage(text) {
  const enabled = loadConfig();
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // Time & Date
  if (enabled.time_date) {
    if (/(what'?s|what is|tell me).*(time|date|day)/i.test(lower) || /current time|today's date/i.test(lower)) {
      const now = new Date();
      const response = `Local time: ${now.toLocaleTimeString()}\nDate: ${now.toLocaleDateString()}`;
      addEvent({ type: "skill", skill: "time_date", input: raw });
      return { text: response, skill: "time_date" };
    }
  }

  // Notes
  if (enabled.notes) {
    const noteMatch = raw.match(/^(note|remember)\s*[:\-]?\s+(.+)/i);
    if (noteMatch) {
      const note = addNote(noteMatch[2].trim());
      addEvent({ type: "skill", skill: "notes", input: raw });
      return { text: `Saved note (${note.id}): ${note.text}`, skill: "notes" };
    }
    if (/^(list|show)\s+notes/i.test(lower)) {
      const notes = listNotes(5);
      addEvent({ type: "skill", skill: "notes", input: raw });
      const formatted = notes.length
        ? notes.map(n => `- (${n.id}) ${n.text}`).join("\n")
        : "No notes yet.";
      return { text: formatted, skill: "notes" };
    }
    if (/^clear\s+notes/i.test(lower)) {
      clearNotes();
      addEvent({ type: "skill", skill: "notes", input: raw });
      return { text: "Cleared all notes.", skill: "notes" };
    }
  }

  // Todos
  if (enabled.todos) {
    const addMatch = raw.match(/^(todo|task)\s+add\s+(.+)/i) || raw.match(/^add\s+(todo|task)\s+(.+)/i);
    if (addMatch) {
      const textValue = addMatch[2].trim();
      const item = addTodo(textValue);
      addEvent({ type: "skill", skill: "todos", input: raw });
      return { text: `Added task (${item.id}): ${item.text}`, skill: "todos" };
    }
    if (/^(list|show)\s+(todos|tasks)/i.test(lower)) {
      const items = listTodos(false);
      addEvent({ type: "skill", skill: "todos", input: raw });
      return { text: formatTodos(items), skill: "todos" };
    }
    const doneMatch = raw.match(/^(done|complete)\s+(todo|task)\s+(.+)/i);
    if (doneMatch) {
      const target = doneMatch[3].trim();
      const item = completeTodo(target);
      addEvent({ type: "skill", skill: "todos", input: raw });
      return { text: item ? `Completed: ${item.text}` : "Task not found.", skill: "todos" };
    }
  }

  // System status
  if (enabled.system_status) {
    if (/system status|cpu|memory|uptime/i.test(lower)) {
      const load = os.loadavg().map(v => v.toFixed(2)).join(", ");
      const total = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
      const free = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
      const up = Math.floor(os.uptime());
      addEvent({ type: "skill", skill: "system_status", input: raw });
      return {
        text: `CPU load (1/5/15m): ${load}\nMemory: ${free} GB free / ${total} GB\nUptime: ${up}s`,
        skill: "system_status"
      };
    }
  }

  return null;
}
