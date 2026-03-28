import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { syncModuleRegistry } from "../src/aika/moduleRegistry.js";
import { routeAikaCommand } from "../src/aika/commandRouter.js";

initDb();
runMigrations();
syncModuleRegistry();

test("routeAikaCommand handles module registry request", async () => {
  const result = await routeAikaCommand({ text: "AIKA, show my modules", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.includes("Level"));
});

test("routeAikaCommand handles daily digest", async () => {
  const result = await routeAikaCommand({ text: "AIKA, run daily digest", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.includes("Daily Digest"));
});

test("routeAikaCommand handles no-integrations prefix", async () => {
  const result = await routeAikaCommand({ text: "EMAIL: Follow up with vendor", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.toLowerCase().includes("no-integrations"));
});

test("routeAikaCommand handles command grammar protocol", async () => {
  const result = await routeAikaCommand({ text: "AIKA, analyze vendor concentration risk", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.includes("1. Goal"));
  assert.ok(result.reply.includes("8. Next Step"));
});

test("routeAikaCommand keeps configure commands from digest keyword hijack", async () => {
  const result = await routeAikaCommand({ text: "AIKA, configure daily digest to 8:00am", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.ok(result.reply.includes("Updated"));
});

test("routeAikaCommand handles mode off without enabling mode", async () => {
  const result = await routeAikaCommand({ text: "AIKA, focus mode off", context: { userId: "local" } });
  assert.equal(result.handled, true);
  assert.equal(result.reply, "Focus Mode disabled.");
});

test("routeAikaCommand dispatches deterministic web control via action.run", async () => {
  const stubExecutor = {
    async callTool({ name }) {
      if (name === "action.run") {
        return { status: "approval_required", approval: { id: "apr_lane_1" } };
      }
      return { status: "ok", data: {} };
    }
  };
  const result = await routeAikaCommand({
    text: "AIKA, control https://example.com and extract page text",
    context: { userId: "local", workspaceId: "default" },
    deps: { toolExecutor: stubExecutor }
  });
  assert.equal(result.handled, true);
  assert.equal(result.status, "approval_required");
  assert.equal(result.approval?.id, "apr_lane_1");
  assert.equal(result.data?.laneResult?.tool, "action.run");
  assert.equal(result.approval?.approvalContext?.tool, "action.run");
  assert.equal(result.approval?.approvalContext?.risk, "approval_required");
  assert.ok(String(result.approval?.approvalContext?.boundary || "").includes("external web"));
  assert.ok(String(result.approval?.approvalContext?.rollback || "").length > 10);
});

test("routeAikaCommand uses web.search when control request has no URL", async () => {
  const stubExecutor = {
    async callTool({ name, params }) {
      if (name === "web.search") {
        return { status: "ok", data: { results: [{ title: "A", url: "https://a.example" }], query: params.query } };
      }
      return { status: "ok", data: {} };
    }
  };
  const result = await routeAikaCommand({
    text: "AIKA, control browser and find latest OpenClaw docs",
    context: { userId: "local", workspaceId: "default" },
    deps: { toolExecutor: stubExecutor }
  });
  assert.equal(result.handled, true);
  assert.equal(result.status, "completed");
  assert.equal(result.data?.laneResult?.tool, "web.search");
});
