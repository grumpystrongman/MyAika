import test from "node:test";
import assert from "node:assert/strict";
import { initDb } from "../storage/db.js";
import { runMigrations } from "../storage/schema.js";
import { syncModuleRegistry } from "../src/aika/moduleRegistry.js";
import { routeAikaCommand } from "../src/aika/commandRouter.js";
import { listWorkflowSkills } from "../src/aika/workflowSkills.js";

initDb();
runMigrations();
syncModuleRegistry();

test("workflow skill pack registers at least five high-frequency handlers", () => {
  const skills = listWorkflowSkills();
  assert.ok(Array.isArray(skills));
  assert.ok(skills.length >= 5);
});

test("routeAikaCommand dispatches to workflow skills before generic intent protocol", async () => {
  const moduleCalls = [];
  const runbookCalls = [];
  const digestCalls = [];
  const digestRecords = [];

  const deps = {
    moduleExecutor: async ({ moduleId, inputPayload }) => {
      moduleCalls.push({ moduleId, inputPayload });
      return {
        status: "completed",
        output: { summary: `module:${moduleId}` },
        run: { id: `run-${moduleId}` }
      };
    },
    runbookExecutor: async ({ name, inputPayload }) => {
      runbookCalls.push({ name, inputPayload });
      return {
        status: "completed",
        output: { summary: `runbook:${name}` },
        run: { id: `runbook-${name}` }
      };
    },
    digestBuilder: async (type) => {
      digestCalls.push(type);
      return { text: `${type.toUpperCase()} DIGEST` };
    },
    digestRecorder: ({ userId, digest }) => {
      digestRecords.push({ userId, digest: digest?.text || "" });
    }
  };

  const cases = [
    { text: "AIKA, run my daily digest", expectedSkill: "daily_digest_cockpit" },
    { text: "AIKA, research and summarize payer mix variance", expectedSkill: "research_and_summarize" },
    { text: "AIKA, triage inbox for today", expectedSkill: "inbox_triage_fastlane" },
    { text: "AIKA, clean my calendar for conflicts", expectedSkill: "calendar_hygiene_fastlane" },
    { text: "AIKA, prepare meeting packet for leadership sync", expectedSkill: "meeting_to_action_engine" },
    { text: "AIKA, start incident response for claims outage", expectedSkill: "incident_triage_command" },
    { text: "AIKA, execute triage inbox for this morning", expectedSkill: "inbox_triage_fastlane" }
  ];

  for (const item of cases) {
    const result = await routeAikaCommand({
      text: item.text,
      context: { userId: "local" },
      deps
    });
    assert.equal(result.handled, true);
    assert.equal(result.data?.workflowSkill?.id, item.expectedSkill);
  }

  assert.equal(digestCalls.length, 1);
  assert.equal(digestRecords.length, 1);
  assert.ok(moduleCalls.length >= 4);
  assert.ok(runbookCalls.length >= 1);
});
