import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const runsDir = path.join(repoRoot, "data", "codex_runs");

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function runDir(runId) {
  return path.join(runsDir, runId);
}

function runFilePath(runId) {
  return path.join(runDir(runId), "run.json");
}

function readRun(runId) {
  try {
    const raw = fs.readFileSync(runFilePath(runId), "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRun(record) {
  if (!record?.id) return null;
  ensureDir(runDir(record.id));
  fs.writeFileSync(runFilePath(record.id), JSON.stringify(record, null, 2));
  return record;
}

function updateRun(runId, updater) {
  const record = readRun(runId);
  if (!record) return null;
  const next = typeof updater === "function" ? updater(record) : { ...record, ...(updater || {}) };
  next.updatedAt = nowIso();
  return writeRun(next);
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["full", "danger", "danger-full-access"].includes(normalized)) return "full";
  if (["safe", "full-auto", "workspace"].includes(normalized)) return "safe";
  if (["read", "read-only", "readonly"].includes(normalized)) return "read-only";
  return "";
}

function buildCodexPrompt(userPrompt) {
  const trimmed = String(userPrompt || "").trim();
  const guardrails = [
    "Safety guardrails:",
    "- Do not send external emails, edit calendar events with attendees, publish, delete, or purchase.",
    "- If any such action is required, stop and report what needs confirmation.",
    "When done, summarize changes and tests run (with results)."
  ].join("\n");
  return `${guardrails}\n\nUser request:\n${trimmed}\n`;
}

function resolveCodexBin() {
  const configured = process.env.CODEX_BIN || process.env.CODEX_PATH || "";
  if (configured) {
    if (!fs.existsSync(configured)) {
      const err = new Error("codex_bin_not_found");
      err.detail = configured;
      throw err;
    }
    return configured;
  }
  return "codex";
}

function resolveDefaultMode() {
  const explicit = normalizeMode(process.env.CODEX_REMOTE_MODE || "");
  if (explicit) return explicit;
  if (String(process.env.CODEX_REMOTE_FULL_ACCESS || "") === "1") return "full";
  return "safe";
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function buildCodexArgs({ mode, runPath, model, profile, addDirs = [] }) {
  const args = [
    "exec",
    "--color",
    "never",
    "-C",
    repoRoot,
    "--output-last-message",
    path.join(runPath, "last_message.txt")
  ];

  const normalizedMode = normalizeMode(mode) || resolveDefaultMode();
  if (normalizedMode === "full") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (normalizedMode === "read-only") {
    args.push("--sandbox", "read-only");
  } else {
    args.push("--full-auto");
  }

  const resolvedModel = String(model || process.env.CODEX_REMOTE_MODEL || "").trim();
  if (resolvedModel) args.push("--model", resolvedModel);

  const resolvedProfile = String(profile || process.env.CODEX_REMOTE_PROFILE || "").trim();
  if (resolvedProfile) args.push("--profile", resolvedProfile);

  const extraDirs = [
    ...parseList(process.env.CODEX_REMOTE_ADD_DIRS || ""),
    ...addDirs
  ].filter(Boolean);
  for (const dir of extraDirs) {
    args.push("--add-dir", dir);
  }

  args.push("-");
  return args;
}

export function createCodexRunRecord({
  prompt,
  mode,
  channel,
  chatId,
  senderId,
  senderName
} = {}) {
  const id = crypto.randomUUID();
  const cleanedPrompt = String(prompt || "").trim();
  const promptPreview = cleanedPrompt.length > 2000
    ? `${cleanedPrompt.slice(0, 2000).trim()}… (truncated)`
    : cleanedPrompt;
  const record = {
    id,
    status: "pending",
    mode: normalizeMode(mode) || resolveDefaultMode(),
    prompt: promptPreview,
    channel: channel || "",
    chatId: chatId || "",
    senderId: senderId || "",
    senderName: senderName || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    pid: null,
    exitCode: null,
    signal: null,
    error: null,
    command: null,
    outputs: {
      stdout: "stdout.log",
      stderr: "stderr.log",
      lastMessage: "last_message.txt"
    }
  };
  return writeRun(record);
}

export function getCodexRun(runId) {
  return runId ? readRun(runId) : null;
}

export function listCodexRuns(limit = 20) {
  try {
    if (!fs.existsSync(runsDir)) return [];
    const entries = fs.readdirSync(runsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    const items = entries
      .map(id => readRun(id))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export function readCodexLastMessage(runId, maxChars = 4000) {
  const record = readRun(runId);
  if (!record) return "";
  const filePath = path.join(runDir(runId), record.outputs?.lastMessage || "last_message.txt");
  try {
    if (!fs.existsSync(filePath)) return "";
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return "";
    const trimmed = raw.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars - 20).trim()}… (truncated)`;
  } catch {
    return "";
  }
}

export function tailCodexLog(runId, stream = "stdout", maxLines = 40, maxChars = 3500) {
  const record = readRun(runId);
  if (!record) return "";
  const key = stream === "stderr" ? "stderr" : "stdout";
  const filePath = path.join(runDir(runId), record.outputs?.[key] || `${key}.log`);
  try {
    if (!fs.existsSync(filePath)) return "";
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return "";
    const lines = raw.split(/\r?\n/);
    const tail = lines.slice(-maxLines).join("\n").trim();
    if (tail.length <= maxChars) return tail;
    return `${tail.slice(0, maxChars - 20).trim()}… (truncated)`;
  } catch {
    return "";
  }
}

export function startCodexRun({
  prompt,
  mode,
  channel,
  chatId,
  senderId,
  senderName,
  model,
  profile,
  addDirs = [],
  timeoutMs = 0,
  onComplete
} = {}) {
  if (!prompt) {
    const err = new Error("codex_prompt_required");
    err.status = 400;
    throw err;
  }

  const record = createCodexRunRecord({ prompt, mode, channel, chatId, senderId, senderName });
  const runPath = runDir(record.id);
  ensureDir(runPath);

  let child;
  let timeoutId = null;
  let stdoutStream = null;
  let stderrStream = null;
  let notified = false;

  const notifyOnce = payload => {
    if (notified) return;
    notified = true;
    if (typeof onComplete === "function") onComplete(payload || {});
  };

  try {
    const bin = resolveCodexBin();
    const args = buildCodexArgs({ mode: record.mode, runPath, model, profile, addDirs });

    const stdoutPath = path.join(runPath, record.outputs.stdout);
    const stderrPath = path.join(runPath, record.outputs.stderr);
    stdoutStream = fs.createWriteStream(stdoutPath, { flags: "a" });
    stderrStream = fs.createWriteStream(stderrPath, { flags: "a" });

    child = spawn(bin, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    if (child.stdout) child.stdout.pipe(stdoutStream);
    if (child.stderr) child.stderr.pipe(stderrStream);

    updateRun(record.id, current => ({
      ...current,
      status: "running",
      startedAt: nowIso(),
      pid: child.pid || null,
      command: { bin, args }
    }));

    const combinedPrompt = buildCodexPrompt(prompt);
    if (child.stdin) {
      child.stdin.write(combinedPrompt);
      child.stdin.end();
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        try { child.kill(); } catch {}
        updateRun(record.id, {
          status: "error",
          error: "codex_timeout",
          finishedAt: nowIso()
        });
      }, timeoutMs);
    }

    child.on("error", err => {
      if (timeoutId) clearTimeout(timeoutId);
      updateRun(record.id, {
        status: "error",
        error: err?.message || "codex_spawn_failed",
        finishedAt: nowIso()
      });
      notifyOnce({ runId: record.id, status: "error", error: err?.message || "codex_spawn_failed" });
    });

    child.on("close", (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);
      updateRun(record.id, {
        status: code === 0 ? "completed" : "error",
        exitCode: Number.isFinite(code) ? code : null,
        signal: signal || null,
        finishedAt: nowIso()
      });
      notifyOnce({ runId: record.id, status: code === 0 ? "completed" : "error", exitCode: code, signal });
    });
  } catch (err) {
    updateRun(record.id, {
      status: "error",
      error: err?.message || "codex_start_failed",
      finishedAt: nowIso()
    });
    notifyOnce({ runId: record.id, status: "error", error: err?.message || "codex_start_failed" });
  } finally {
    if (stdoutStream) stdoutStream.on("error", () => {});
    if (stderrStream) stderrStream.on("error", () => {});
  }

  return record;
}
