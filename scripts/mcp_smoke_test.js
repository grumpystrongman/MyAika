// MCP-lite smoke tests (basic)
// Usage: node scripts/mcp_smoke_test.js
const BASE = process.env.MCP_BASE_URL || "http://127.0.0.1:8790";

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, data: await r.json() };
}

async function run() {
  console.log("tools.list");
  console.log(await get("/api/tools"));

  console.log("meeting.summarize");
  const meeting = await post("/api/tools/call", {
    name: "meeting.summarize",
    params: { title: "Test Meeting", transcript: "We decided to ship MVP. Action: Jeff to review." },
    context: { source: "smoke" }
  });
  console.log(meeting.status, meeting.data?.status || meeting.data);

  console.log("email.draftReply");
  const draft = await post("/api/tools/call", {
    name: "email.draftReply",
    params: { to: "test@example.com", subject: "Hello", body: "Draft response." },
    context: { source: "smoke" }
  });
  console.log(draft.status, draft.data?.status || draft.data);

  console.log("email.send (should require approval)");
  const approval = await post("/api/tools/call", {
    name: "email.send",
    params: { draftId: draft.data?.data?.id || "missing" },
    context: { source: "smoke" }
  });
  console.log(approval.status, approval.data?.status || approval.data);

  if (approval.data?.approval?.id) {
    const approved = await post(`/api/approvals/${approval.data.approval.id}/approve`, {});
    console.log("approve", approved.status, approved.data?.approval?.status);
    const exec = await post(`/api/approvals/${approval.data.approval.id}/execute`, {
      token: approved.data?.approval?.token
    });
    console.log("execute", exec.status, exec.data?.status || exec.data);
  }

  console.log("memory.write/search");
  await post("/api/tools/call", {
    name: "memory.write",
    params: { tier: "memory_profile", content: "prefers tea", metadata: { source: "smoke" } }
  });
  await post("/api/tools/call", {
    name: "memory.write",
    params: { tier: "memory_work", content: "project alpha", metadata: { source: "smoke" } }
  });
  await post("/api/tools/call", {
    name: "memory.write",
    params: { tier: "memory_phi", content: "Patient John Doe DOB 01/02/1980", metadata: { source: "smoke" } }
  });
  const mem = await post("/api/tools/call", {
    name: "memory.search",
    params: { tier: "memory_work", query: "alpha" }
  });
  console.log("memory.search", mem.status, mem.data?.data?.length);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
