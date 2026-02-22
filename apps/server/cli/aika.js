#!/usr/bin/env node
import fs from "node:fs";

const baseUrl = process.env.AIKA_BASE_URL || "http://localhost:8790";

function readJsonArg(args) {
  const jsonIdx = args.indexOf("--json");
  if (jsonIdx !== -1 && args[jsonIdx + 1]) {
    return JSON.parse(args[jsonIdx + 1]);
  }
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const raw = fs.readFileSync(args[fileIdx + 1], "utf-8");
    return JSON.parse(raw);
  }
  return {};
}

async function api(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { status: "error", error: data.error || "request_failed", detail: data };
  }
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "help") {
    console.log(JSON.stringify({
      usage: [
        "aika run <toolName> --json '{...}'",
        "aika run <toolName> --file payload.json",
        "aika modules list",
        "aika modules run <moduleId> --json '{...}'",
        "aika runbook list",
        "aika runbook run <name> --json '{...}'",
        "aika digest <daily|pulse|weekly>",
        "aika watch list",
        "aika watch create <templateId>",
        "aika watch observe <watchId> --json '{...}'",
        "aika approvals list",
        "aika approvals approve <approvalId>",
        "aika approvals deny <approvalId>",
        "aika config status"
      ]
    }, null, 2));
    return;
  }

  if (cmd === "run") {
    const toolName = args[1];
    if (!toolName) {
      console.log(JSON.stringify({ status: "error", error: "toolName_required" }));
      return;
    }
    const payload = readJsonArg(args.slice(2));
    const data = await api("/api/tools/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: toolName, params: payload })
    });
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === "modules") {
    const sub = args[1] || "list";
    if (sub === "list") {
      const data = await api("/api/aika/modules");
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (sub === "run") {
      const moduleId = args[2];
      if (!moduleId) {
        console.log(JSON.stringify({ status: "error", error: "moduleId_required" }));
        return;
      }
      const payload = readJsonArg(args.slice(3));
      const data = await api("/api/aika/modules/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, inputPayload: payload })
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }
  }

  if (cmd === "runbook") {
    const sub = args[1] || "list";
    if (sub === "list") {
      const data = await api("/api/aika/runbooks");
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (sub === "run") {
      const name = args[2];
      if (!name) {
        console.log(JSON.stringify({ status: "error", error: "runbook_name_required" }));
        return;
      }
      const payload = readJsonArg(args.slice(3));
      const data = await api("/api/aika/runbooks/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, inputPayload: payload })
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }
  }

  if (cmd === "digest") {
    const type = args[1] || "daily";
    const data = await api("/api/aika/digests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type })
    });
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === "watch") {
    const sub = args[1] || "list";
    if (sub === "list") {
      const data = await api("/api/aika/watch");
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (sub === "create") {
      const templateId = args[2];
      const data = await api("/api/aika/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId })
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (sub === "observe") {
      const watchId = args[2];
      const payload = readJsonArg(args.slice(3));
      const data = await api(`/api/aika/watch/${watchId}/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: payload })
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }
  }

  if (cmd === "approvals") {
    const sub = args[1];
    if (sub === "list") {
      const data = await api("/api/approvals");
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (sub === "approve") {
      const id = args[2];
      const data = await api(`/api/approvals/${id}/approve`, { method: "POST" });
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (sub === "deny") {
      const id = args[2];
      const data = await api(`/api/approvals/${id}/deny`, { method: "POST" });
      console.log(JSON.stringify(data, null, 2));
      return;
    }
  }

  if (cmd === "config" && args[1] === "status") {
    const data = await api("/api/status");
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(JSON.stringify({ status: "error", error: "unknown_command" }, null, 2));
}

main().catch(err => {
  console.log(JSON.stringify({ status: "error", error: err?.message || "cli_failed" }));
});
