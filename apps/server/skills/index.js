import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data", "skills");
const notesFile = path.join(dataDir, "notes.jsonl");
const todosFile = path.join(dataDir, "todos.json");
const shoppingFile = path.join(dataDir, "shopping.json");
const remindersFile = path.join(dataDir, "reminders.json");
const webhooksFile = path.join(dataDir, "webhooks.json");
const scenesFile = path.join(dataDir, "scenes.json");
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
  },
  {
    key: "shopping",
    label: "Shopping List",
    description: "Add/remove items and list shopping needs.",
    enabled: true
  },
  {
    key: "reminders",
    label: "Reminders",
    description: "Create simple time-based reminders and list them.",
    enabled: true
  },
  {
    key: "webhooks",
    label: "Webhooks",
    description: "Trigger configured webhooks for home/automation scenes.",
    enabled: false
  },
  {
    key: "scenes",
    label: "Scenes",
    description: "Trigger multiple webhooks as a scene.",
    enabled: false
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

function loadShopping() {
  return safeReadJson(shoppingFile, []);
}

function saveShopping(items) {
  ensureDir();
  fs.writeFileSync(shoppingFile, JSON.stringify(items, null, 2));
}

function addShoppingItem(text) {
  const items = loadShopping();
  const item = { id: Date.now().toString(36), text, createdAt: nowIso() };
  items.push(item);
  saveShopping(items);
  return item;
}

function removeShoppingItem(text) {
  const items = loadShopping();
  const target = text.toLowerCase();
  const next = items.filter(i => i.text.toLowerCase() !== target);
  const removed = next.length !== items.length;
  if (removed) saveShopping(next);
  return removed;
}

function clearShopping() {
  saveShopping([]);
}

function listShopping() {
  return loadShopping().slice(-20).reverse();
}

function loadReminders() {
  return safeReadJson(remindersFile, []);
}

function saveReminders(items) {
  ensureDir();
  fs.writeFileSync(remindersFile, JSON.stringify(items, null, 2));
}

function addReminder(text, dueAt) {
  const items = loadReminders();
  const item = {
    id: Date.now().toString(36),
    text,
    dueAt,
    createdAt: nowIso(),
    done: false
  };
  items.push(item);
  saveReminders(items);
  return item;
}

function completeReminder(target) {
  const items = loadReminders();
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
  if (updated) saveReminders(items);
  return updated;
}

function listReminders(showAll = false) {
  const items = loadReminders();
  return items.filter(r => (showAll ? true : !r.done)).slice(-10).reverse();
}

function parseReminderTime(raw) {
  const lower = raw.toLowerCase();
  const inMatch = lower.match(/in\s+(\d+)\s*(minute|minutes|hour|hours)/i);
  if (inMatch) {
    const amount = Number(inMatch[1]);
    const unit = inMatch[2].startsWith("hour") ? 60 : 1;
    const ms = amount * unit * 60 * 1000;
    return new Date(Date.now() + ms).toISOString();
  }
  const atMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (atMatch) {
    const now = new Date();
    let hour = Number(atMatch[1]);
    const minute = Number(atMatch[2] || 0);
    const mer = atMatch[3];
    if (mer) {
      if (mer === "pm" && hour < 12) hour += 12;
      if (mer === "am" && hour === 12) hour = 0;
    }
    const due = new Date(now);
    due.setHours(hour, minute, 0, 0);
    if (due.getTime() < now.getTime()) {
      due.setDate(due.getDate() + 1);
    }
    return due.toISOString();
  }
  return null;
}

function loadWebhooks() {
  return safeReadJson(webhooksFile, []);
}

function saveWebhooks(items) {
  ensureDir();
  fs.writeFileSync(webhooksFile, JSON.stringify(items, null, 2));
}

function listWebhooks() {
  return loadWebhooks();
}

function addWebhook(name, url) {
  const items = loadWebhooks();
  const exists = items.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    exists.url = url;
    saveWebhooks(items);
    return exists;
  }
  const item = { id: Date.now().toString(36), name, url, createdAt: nowIso() };
  items.push(item);
  saveWebhooks(items);
  return item;
}

function removeWebhook(nameOrId) {
  const target = nameOrId.toLowerCase();
  const items = loadWebhooks();
  const next = items.filter(i => i.id.toLowerCase() !== target && i.name.toLowerCase() !== target);
  const removed = next.length !== items.length;
  if (removed) saveWebhooks(next);
  return removed;
}

function loadScenes() {
  return safeReadJson(scenesFile, []);
}

function saveScenes(items) {
  ensureDir();
  fs.writeFileSync(scenesFile, JSON.stringify(items, null, 2));
}

function addScene(name, hooks) {
  const items = loadScenes();
  const existing = items.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.hooks = hooks;
    saveScenes(items);
    return existing;
  }
  const item = { id: Date.now().toString(36), name, hooks, createdAt: nowIso() };
  items.push(item);
  saveScenes(items);
  return item;
}

function removeScene(nameOrId) {
  const target = nameOrId.toLowerCase();
  const items = loadScenes();
  const next = items.filter(i => i.id.toLowerCase() !== target && i.name.toLowerCase() !== target);
  const removed = next.length !== items.length;
  if (removed) saveScenes(next);
  return removed;
}

function listScenes() {
  return loadScenes();
}

async function triggerWebhook(url, payload) {
  if (!allowedWebhook(url)) {
    throw new Error("webhook_not_allowed");
  }
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function triggerScene(name, input) {
  const scenes = listScenes();
  const scene = scenes.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (!scene) return null;
  const hooks = listWebhooks();
  for (const hookName of scene.hooks) {
    const hook = hooks.find(h => h.name.toLowerCase() === hookName.toLowerCase());
    if (!hook) continue;
    await triggerWebhook(hook.url, { source: "aika", name: hook.name, scene: scene.name, input, time: nowIso() });
  }
  return scene;
}

function allowedWebhook(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const allowlist = process.env.SKILLS_WEBHOOK_ALLOWLIST || "";
    if (allowlist) {
      const allowed = allowlist.split(",").map(s => s.trim()).filter(Boolean);
      return allowed.some(host => u.hostname.endsWith(host));
    }
    return true;
  } catch {
    return false;
  }
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

export async function handleSkillMessage(text) {
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

  // Shopping list
  if (enabled.shopping) {
    const addMatch = raw.match(/^(add|buy|get)\s+(.+)\s+to\s+(shopping|grocery)\s+list/i) ||
      raw.match(/^(shopping|grocery)\s+add\s+(.+)/i);
    if (addMatch) {
      const textValue = (addMatch[2] || addMatch[3]).trim();
      const item = addShoppingItem(textValue);
      addEvent({ type: "skill", skill: "shopping", input: raw });
      return { text: `Added to shopping list (${item.id}): ${item.text}`, skill: "shopping" };
    }
    if (/^(list|show)\s+(shopping|grocery)\s+list/i.test(lower)) {
      const items = listShopping();
      addEvent({ type: "skill", skill: "shopping", input: raw });
      return { text: items.length ? items.map(i => `- (${i.id}) ${i.text}`).join("\n") : "Shopping list is empty.", skill: "shopping" };
    }
    const removeMatch = raw.match(/^(remove|delete)\s+(.+)\s+from\s+(shopping|grocery)\s+list/i);
    if (removeMatch) {
      const target = removeMatch[2].trim();
      const removed = removeShoppingItem(target);
      addEvent({ type: "skill", skill: "shopping", input: raw });
      return { text: removed ? `Removed "${target}" from shopping list.` : "Item not found.", skill: "shopping" };
    }
    if (/^clear\s+(shopping|grocery)\s+list/i.test(lower)) {
      clearShopping();
      addEvent({ type: "skill", skill: "shopping", input: raw });
      return { text: "Shopping list cleared.", skill: "shopping" };
    }
  }

  // Reminders
  if (enabled.reminders) {
    const remindMatch = raw.match(/remind me (.+)/i);
    if (remindMatch) {
      const dueAt = parseReminderTime(raw);
      const cleanText = raw.replace(/remind me/i, "").trim();
      if (!dueAt) {
        return { text: "I couldn't find a time. Try: 'remind me at 3pm to call mom' or 'remind me in 15 minutes to stretch'.", skill: "reminders" };
      }
      const item = addReminder(cleanText, dueAt);
      addEvent({ type: "skill", skill: "reminders", input: raw });
      return { text: `Reminder set (${item.id}) for ${new Date(dueAt).toLocaleString()}: ${item.text}`, skill: "reminders" };
    }
    if (/^(list|show)\s+reminders/i.test(lower)) {
      const items = listReminders(false);
      addEvent({ type: "skill", skill: "reminders", input: raw });
      return {
        text: items.length
          ? items.map(r => `- (${r.id}) ${r.text} @ ${new Date(r.dueAt).toLocaleString()}`).join("\n")
          : "No reminders yet.",
        skill: "reminders"
      };
    }
    const doneMatch = raw.match(/^(done|complete)\s+reminder\s+(.+)/i);
    if (doneMatch) {
      const target = doneMatch[2].trim().toLowerCase();
      const item = completeReminder(target);
      addEvent({ type: "skill", skill: "reminders", input: raw });
      return { text: item ? `Completed reminder: ${item.text}` : "Reminder not found.", skill: "reminders" };
    }
  }

  // Webhooks
  if (enabled.webhooks) {
    const triggerMatch = raw.match(/^(trigger|run|activate)\s+(.+)/i);
    if (triggerMatch) {
      const name = triggerMatch[2].trim();
      const hooks = listWebhooks();
      const hook = hooks.find(h => h.name.toLowerCase() === name.toLowerCase());
      if (!hook) {
        return { text: `No webhook named "${name}". Add it in the Skills tab.`, skill: "webhooks" };
      }
      if (!allowedWebhook(hook.url)) {
        return { text: "Webhook URL is not allowed. Check SKILLS_WEBHOOK_ALLOWLIST.", skill: "webhooks" };
      }
      try {
        await triggerWebhook(hook.url, { source: "aika", name: hook.name, input: raw, time: nowIso() });
        addEvent({ type: "skill", skill: "webhooks", input: raw });
        return { text: `Triggered "${hook.name}".`, skill: "webhooks" };
      } catch (err) {
        return { text: `Webhook failed: ${err?.message || "request_failed"}`, skill: "webhooks" };
      }
    }
  }

  // Scenes
  if (enabled.scenes) {
    const sceneMatch = raw.match(/^(run|trigger|scene)\s+(.+)/i);
    if (sceneMatch) {
      const name = sceneMatch[2].trim();
      try {
        const scene = await triggerScene(name, raw);
        if (!scene) return { text: `No scene named "${name}".`, skill: "scenes" };
        addEvent({ type: "skill", skill: "scenes", input: raw });
        return { text: `Scene "${scene.name}" triggered.`, skill: "scenes" };
      } catch (err) {
        return { text: `Scene failed: ${err?.message || "request_failed"}`, skill: "scenes" };
      }
    }
    if (/^(list|show)\s+scenes/i.test(lower)) {
      const scenes = listScenes();
      addEvent({ type: "skill", skill: "scenes", input: raw });
      return { text: scenes.length ? scenes.map(s => `- (${s.id}) ${s.name}: ${s.hooks.join(", ")}`).join("\n") : "No scenes yet.", skill: "scenes" };
    }
  }

  // Meeting recorder helper
  if (lower.includes("record meeting") || lower.includes("start meeting")) {
    addEvent({ type: "skill", skill: "meeting", input: raw });
    return {
      text: "Meeting recorder is ready. Open the Skills tab → Meeting Recorder and click Start Recording. When done, click Generate Summary to create a shareable document.",
      skill: "meeting"
    };
  }

  return null;
}

export function exportNotesText() {
  const notes = listNotes(200);
  return notes.map(n => `- (${n.id}) ${n.text}`).join(os.EOL);
}

export function exportTodosText() {
  const items = loadTodos();
  return items.map(t => `- [${t.done ? "x" : " "}] (${t.id}) ${t.text}`).join(os.EOL);
}

export function exportShoppingText() {
  const items = loadShopping();
  return items.map(i => `- (${i.id}) ${i.text}`).join(os.EOL);
}

export function exportRemindersText() {
  const items = loadReminders();
  return items.map(r => `- (${r.id}) ${r.text} @ ${r.dueAt}`).join(os.EOL);
}

export { listWebhooks, addWebhook, removeWebhook, listScenes, addScene, removeScene, triggerScene };

let reminderTimerStarted = false;
export function startReminderScheduler() {
  if (reminderTimerStarted) return;
  reminderTimerStarted = true;
  setInterval(() => {
    const items = loadReminders();
    let changed = false;
    const now = Date.now();
    for (const item of items) {
      if (item.done || item.notifiedAt) continue;
      const due = Date.parse(item.dueAt);
      if (Number.isFinite(due) && due <= now) {
        item.notifiedAt = nowIso();
        addEvent({ type: "reminder_due", skill: "reminders", input: item.text, reminderId: item.id });
        changed = true;
      }
    }
    if (changed) saveReminders(items);
  }, 15000);
}
