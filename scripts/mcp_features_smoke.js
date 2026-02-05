// MCP Features smoke test
// Usage: node scripts/mcp_features_smoke.js
const BASE = process.env.MCP_BASE_URL || "http://127.0.0.1:8790";
const SMOKE_USER = process.env.SMOKE_USER_ID || "smoke-user";

async function get(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "x-user-id": SMOKE_USER }
  });
  const data = await r.json();
  return { status: r.status, data };
}

function inferService(toolName) {
  const [prefix, rest] = String(toolName || "").split(".");
  if (prefix === "messaging") {
    if (rest?.toLowerCase().includes("slack")) return "slack";
    if (rest?.toLowerCase().includes("telegram")) return "telegram";
    if (rest?.toLowerCase().includes("discord")) return "discord";
    return "messaging";
  }
  if (prefix === "integrations") {
    if (rest?.toLowerCase().includes("plex")) return "plex";
    if (rest?.toLowerCase().includes("fireflies")) return "fireflies";
    return "integrations";
  }
  return prefix || "core";
}

(async () => {
  const tools = await get("/api/tools");
  const integrations = await get("/api/integrations");
  console.log("tools", tools.status, tools.data.tools?.length || 0);
  console.log("integrations", integrations.status);
  const services = new Map();
  for (const t of tools.data.tools || []) {
    const s = inferService(t.name);
    services.set(s, (services.get(s) || 0) + 1);
  }
  console.log("services", Array.from(services.entries()));
})();
