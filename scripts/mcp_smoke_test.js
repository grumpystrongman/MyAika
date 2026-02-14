// MCP-lite smoke tests (feature coverage)
// Usage: node scripts/mcp_smoke_test.js
const BASE = process.env.MCP_BASE_URL || "http://127.0.0.1:8790";
const SMOKE_USER = process.env.SMOKE_USER_ID || "smoke-user";
const STRICT = process.env.STRICT_SMOKE === "true";

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
    "messaging.discordSend"
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
  record("calendar.proposeHold", hold.data?.status === "ok", summarizeResult(hold.data));

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
    const adminHeaders = { "x-user-role": "admin" };
    const approval = await post(`/api/approvals/${sendAttempt.data.approval.id}/approve`, {}, adminHeaders);
    const exec = await post(`/api/approvals/${sendAttempt.data.approval.id}/execute`, {
      token: approval.data?.approval?.token
    }, adminHeaders);
    record("email.send execute", exec.data?.status === "ok", summarizeResult(exec.data));
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

  const slack = await callTool("messaging.slackPost", { channel: "#smoke", message: "Smoke test" });
  record("messaging.slackPost", slack.data?.status === "approval_required", summarizeResult(slack.data));

  const telegram = await callTool("messaging.telegramSend", { chatId: "12345", message: "Smoke test" });
  record("messaging.telegramSend", telegram.data?.status === "approval_required", summarizeResult(telegram.data));

  const discord = await callTool("messaging.discordSend", { channelId: "12345", message: "Smoke test" });
  record("messaging.discordSend", discord.data?.status === "approval_required", summarizeResult(discord.data));

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
