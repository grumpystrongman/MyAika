// MCP-lite smoke tests (feature coverage)
// Usage: node scripts/mcp_smoke_test.js
const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");

const repoRoot = path.resolve(process.cwd());
const envPath = path.join(repoRoot, "apps", "server", ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}
const BASE = process.env.MCP_BASE_URL || "http://127.0.0.1:8790";
const SMOKE_USER = process.env.SMOKE_USER_ID || "smoke-user";
const STRICT = process.env.STRICT_SMOKE === "true";
const SKIP_SLACK = String(process.env.SMOKE_SKIP_SLACK || process.env.SMOKE_SKIP_SLACK_DISCORD || "").toLowerCase() === "true";
const SKIP_DISCORD = String(process.env.SMOKE_SKIP_DISCORD || process.env.SMOKE_SKIP_SLACK_DISCORD || "").toLowerCase() === "true";

function firstFromCsv(value) {
  const raw = String(value || "");
  if (!raw) return "";
  return raw.split(",").map(v => v.trim()).filter(Boolean)[0] || "";
}

const TELEGRAM_CHAT_ID =
  String(process.env.SMOKE_TELEGRAM_CHAT_ID || "").trim()
  || String(process.env.ASSISTANT_TASK_TELEGRAM_CHAT_ID || "").trim()
  || String(process.env.TELEGRAM_CHAT_ID || "").trim()
  || firstFromCsv(process.env.TODO_REMINDER_TELEGRAM_CHAT_IDS);

const defaultHeaders = {
  "Content-Type": "application/json",
  "x-user-id": SMOKE_USER
};

async function post(path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...defaultHeaders, ...headers },
    body: JSON.stringify(body || {})
  });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: r.status, data };
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "x-user-id": SMOKE_USER } });
  return { status: r.status, data: await r.json() };
}

async function callTool(name, params) {
  return post("/api/tools/call", { name, params, context: { source: "smoke" } });
}

async function approveAndExecute(approvalId) {
  const adminHeaders = { "x-user-role": "admin" };
  const approval = await post(`/api/approvals/${approvalId}/approve`, {}, adminHeaders);
  const token = approval.data?.approval?.token;
  if (!token) return { ok: false, detail: summarizeResult(approval.data) };
  const exec = await post(`/api/approvals/${approvalId}/execute`, { token }, adminHeaders);
  return { ok: exec.data?.status === "ok", detail: summarizeResult(exec.data) };
}

function summarizeResult(res) {
  if (!res) return "";
  if (typeof res === "string") return res;
  if (res?.error) return res.error;
  if (res?.status) return res.status;
  return JSON.stringify(res).slice(0, 200);
}

function isNetworkIssue(detail) {
  const msg = String(detail || "").toLowerCase();
  return msg.includes("fetch failed") || msg.includes("network") || msg.includes("timeout");
}

async function run() {
  const results = [];
  const record = (name, ok, detail = "", warn = false) => {
    results.push({ name, ok, detail, warn });
    const tag = ok ? "OK " : warn ? "WARN" : "FAIL";
    console.log(`${tag} ${name}${detail ? ` - ${detail}` : ""}`);
  };

  const toolsList = await get("/api/tools");
  if (!toolsList.status || toolsList.status !== 200) {
    record("tools.list", false, `status ${toolsList.status}`);
  } else {
    record("tools.list", true, `count ${toolsList.data?.tools?.length || 0}`);
  }

  const toolNames = new Set((toolsList.data?.tools || []).map(t => t.name));
  const requiredTools = [
    "meeting.summarize",
    "notes.create",
    "notes.search",
    "todos.create",
    "todos.list",
    "calendar.proposeHold",
    "email.draftReply",
    "email.send",
    "spreadsheet.applyChanges",
    "memory.write",
    "memory.search",
    "integrations.plexIdentity",
    "integrations.firefliesTranscripts",
    "weather.current",
    "web.search",
    "shopping.productResearch",
    "shopping.amazonAddToCart",
    "messaging.slackPost",
    "messaging.telegramSend",
    "messaging.discordSend",
    "desktop.run"
  ];
  const missing = requiredTools.filter(name => !toolNames.has(name));
  if (missing.length) {
    record("tools.required", false, `missing ${missing.join(", ")}`);
  } else {
    record("tools.required", true);
  }

  const meeting = await callTool("meeting.summarize", {
    title: "Smoke Meeting",
    transcript: "Alice: kickoff. Bob: decision to proceed. Action: Jeff to review.",
    store: { googleDocs: false, localMarkdown: true }
  });
  record("meeting.summarize", meeting.data?.status === "ok", summarizeResult(meeting.data));

  const note = await callTool("notes.create", {
    title: "Smoke Note",
    body: "Hello from smoke test.",
    tags: ["smoke"],
    store: { googleDocs: false, localMarkdown: true }
  });
  record("notes.create", note.data?.status === "ok", summarizeResult(note.data));

  const noteSearch = await callTool("notes.search", { query: "smoke", limit: 5 });
  record("notes.search", noteSearch.data?.status === "ok", `results ${noteSearch.data?.data?.length || 0}`);

  const todo = await callTool("todos.create", {
    title: "Smoke todo",
    priority: "medium",
    tags: ["smoke"]
  });
  record("todos.create", todo.data?.status === "ok", summarizeResult(todo.data));

  const todos = await callTool("todos.list", { status: "open", dueWithinDays: 30 });
  record("todos.list", todos.data?.status === "ok", `results ${todos.data?.data?.length || 0}`);

  const hold = await callTool("calendar.proposeHold", {
    title: "Smoke hold",
    start: new Date(Date.now() + 3600 * 1000).toISOString(),
    end: new Date(Date.now() + 7200 * 1000).toISOString(),
    timezone: "America/New_York",
    attendees: ["smoke@example.com"],
    description: "Smoke test hold"
  });
  if (hold.data?.status === "approval_required" && hold.data?.approval?.id) {
    const exec = await approveAndExecute(hold.data.approval.id);
    record("calendar.proposeHold", exec.ok, exec.detail);
  } else {
    record("calendar.proposeHold", hold.data?.status === "ok", summarizeResult(hold.data));
  }

  const draft = await callTool("email.draftReply", {
    originalEmail: {
      from: "sender@example.com",
      to: ["smoke@example.com"],
      subject: "Hello",
      body: "Draft response needed."
    },
    tone: "friendly",
    signOffName: "Aika"
  });
  record("email.draftReply", draft.data?.status === "ok", summarizeResult(draft.data));

  const draftId = draft.data?.data?.id;
  const sendAttempt = await callTool("email.send", { draftId });
  record("email.send (approval required)", sendAttempt.data?.status === "approval_required", summarizeResult(sendAttempt.data));

  if (sendAttempt.data?.approval?.id) {
    const exec = await approveAndExecute(sendAttempt.data.approval.id);
    record("email.send execute", exec.ok, exec.detail);
  }

  const patch = await callTool("spreadsheet.applyChanges", {
    target: { type: "localFile", pathOrId: "smoke.xlsx" },
    changes: [{ op: "setCell", ref: "A1", value: "Smoke" }],
    draftOnly: true
  });
  record("spreadsheet.applyChanges", patch.data?.status === "ok", summarizeResult(patch.data));

  const mem1 = await callTool("memory.write", { tier: 1, title: "Preference", content: "Prefers tea", tags: ["smoke"] });
  record("memory.write.tier1", mem1.data?.status === "ok", summarizeResult(mem1.data));
  const mem2 = await callTool("memory.write", { tier: 2, title: "Project", content: "Project alpha", tags: ["smoke"] });
  record("memory.write.tier2", mem2.data?.status === "ok", summarizeResult(mem2.data));
  const mem3 = await callTool("memory.write", {
    tier: 3,
    title: "Sensitive",
    content: "Patient John Doe DOB 01/02/1980",
    tags: ["phi"],
    containsPHI: true
  });
  record("memory.write.tier3", mem3.data?.status === "ok", summarizeResult(mem3.data));
  const memSearch = await callTool("memory.search", { tier: 2, query: "alpha", limit: 5 });
  record("memory.search", memSearch.data?.status === "ok", `results ${memSearch.data?.data?.length || 0}`);

  const plex = await callTool("integrations.plexIdentity", { mode: "localStub" });
  record("integrations.plexIdentity", plex.data?.status === "ok", summarizeResult(plex.data));
  const fireflies = await callTool("integrations.firefliesTranscripts", { mode: "stub", limit: 3 });
  record("integrations.firefliesTranscripts", fireflies.data?.status === "ok", summarizeResult(fireflies.data));

  const weather = await callTool("weather.current", { location: "Durham, NC" });
  record(
    "weather.current",
    weather.data?.status === "ok",
    summarizeResult(weather.data),
    weather.data?.status !== "ok" && isNetworkIssue(weather.data?.error)
  );

  const web = await callTool("web.search", { query: "Aika assistant features", limit: 3 });
  record(
    "web.search",
    web.data?.status === "ok",
    summarizeResult(web.data),
    web.data?.status !== "ok" && isNetworkIssue(web.data?.error)
  );

  const research = await callTool("shopping.productResearch", { query: "Casio G-Shock Ranger", limit: 3 });
  record("shopping.productResearch", research.data?.status === "ok", summarizeResult(research.data));

  const cart = await callTool("shopping.amazonAddToCart", { asin: "B0006T2IV6", quantity: 1 });
  record("shopping.amazonAddToCart", cart.data?.status === "ok", summarizeResult(cart.data));

  if (SKIP_SLACK) {
    record("messaging.slackPost", true, "skipped");
  } else {
    const slack = await callTool("messaging.slackPost", { channel: "#smoke", message: "Smoke test" });
    record("messaging.slackPost", slack.data?.status === "approval_required", summarizeResult(slack.data));
  }

  if (TELEGRAM_CHAT_ID) {
    const telegram = await callTool("messaging.telegramSend", { chatId: TELEGRAM_CHAT_ID, message: "Smoke test" });
    if (telegram.data?.status === "approval_required" && telegram.data?.approval?.id) {
      const exec = await approveAndExecute(telegram.data.approval.id);
      record("messaging.telegramSend", exec.ok, exec.detail);
    } else {
      record("messaging.telegramSend", telegram.data?.status === "ok", summarizeResult(telegram.data));
    }
  } else {
    record("messaging.telegramSend", false, "missing TELEGRAM_CHAT_ID");
  }

  if (SKIP_DISCORD) {
    record("messaging.discordSend", true, "skipped");
  } else {
    const discord = await callTool("messaging.discordSend", { channelId: "12345", message: "Smoke test" });
    record("messaging.discordSend", discord.data?.status === "approval_required", summarizeResult(discord.data));
  }

  const failed = results.filter(r => !r.ok && (!r.warn || STRICT)).length;
  if (failed) {
    console.error(`Smoke failed: ${failed} checks failed.`);
    process.exit(1);
  }
  console.log("Smoke passed.");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
