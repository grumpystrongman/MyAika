import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  recordAdoptionEvent,
  buildWeeklyAdoptionSummary
} from "../src/plugins/openaegisAdoption.js";

function makeTempRepoWithManifest() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openaegis-adoption-"));
  const pluginDir = path.join(repoRoot, "data", "plugins", "openaegis-openclaw");
  fs.mkdirSync(pluginDir, { recursive: true });
  const manifest = {
    id: "openaegis-openclaw",
    name: "OpenAegis for OpenClaw",
    partnerHost: { id: "openclaw", name: "OpenClaw" },
    adoption: {
      targets: { weeklyInstalls: 10, weeklyActivations: 5, weeklyRetention: 2 },
      metrics: { installsTotal: 0, activationsTotal: 0, retainedTotal: 0, churnTotal: 0, activeWorkspacesEstimate: 0, lastEventAt: null }
    },
    distribution: { packagePath: "partners/openaegis-openclaw" }
  };
  fs.writeFileSync(path.join(pluginDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return repoRoot;
}

test("recordAdoptionEvent updates manifest counters", () => {
  const repoRoot = makeTempRepoWithManifest();
  recordAdoptionEvent({ repoRoot, pluginId: "openaegis-openclaw", eventType: "install", workspaceId: "acme" });
  recordAdoptionEvent({ repoRoot, pluginId: "openaegis-openclaw", eventType: "activate", workspaceId: "acme" });
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "plugins", "openaegis-openclaw", "manifest.json"), "utf8"));
  assert.equal(manifest.adoption.metrics.installsTotal, 1);
  assert.equal(manifest.adoption.metrics.activationsTotal, 1);
  assert.equal(manifest.adoption.metrics.activeWorkspacesEstimate, 1);
});

test("buildWeeklyAdoptionSummary aggregates event window", () => {
  const repoRoot = makeTempRepoWithManifest();
  const now = new Date();
  recordAdoptionEvent({ repoRoot, pluginId: "openaegis-openclaw", eventType: "install", at: now.toISOString() });
  recordAdoptionEvent({ repoRoot, pluginId: "openaegis-openclaw", eventType: "activate", at: now.toISOString() });
  recordAdoptionEvent({ repoRoot, pluginId: "openaegis-openclaw", eventType: "retained", at: now.toISOString() });
  const summary = buildWeeklyAdoptionSummary({ repoRoot });
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].pluginId, "openaegis-openclaw");
  assert.equal(summary.rows[0].installs, 1);
  assert.equal(summary.rows[0].activations, 1);
  assert.equal(summary.rows[0].retained, 1);
});

