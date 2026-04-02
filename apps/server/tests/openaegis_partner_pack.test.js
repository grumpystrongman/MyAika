import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { parsePartnerPluginArgs, scaffoldPartnerPlugins } from "../src/plugins/openaegisPartnerPack.js";

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openaegis-partner-pack-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  const config = {
    defaults: {
      version: "1.2.3",
      entrypoint: "index.js",
      permissions: ["network:openaegis"],
      capabilities: ["chat"],
      targets: {
        weeklyInstalls: 9,
        weeklyActivations: 3,
        weeklyRetention: 2
      }
    },
    hosts: [
      { id: "openclaw", name: "OpenClaw", pluginId: "openaegis-openclaw", status: "prototype" },
      { id: "flowise", name: "Flowise", pluginId: "openaegis-flowise", status: "planned" },
      { id: "n8n", name: "n8n", pluginId: "openaegis-n8n", status: "planned" },
      { id: "langflow", name: "Langflow", pluginId: "openaegis-langflow", status: "planned" }
    ]
  };
  fs.writeFileSync(path.join(root, "config", "openaegis_partner_hosts.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return root;
}

test("parsePartnerPluginArgs parses host filters, config path, and dry-run", () => {
  const parsed = parsePartnerPluginArgs(["--host", "openclaw,flowise", "--config", "custom.json", "--package-root", "dist/partners", "--dry-run"]);
  assert.deepEqual(parsed.requestedHosts, ["openclaw", "flowise"]);
  assert.equal(parsed.configPath, "custom.json");
  assert.equal(parsed.packageRoot, "dist/partners");
  assert.equal(parsed.dryRun, true);
});

test("scaffoldPartnerPlugins writes manifests and package scaffold for selected hosts", () => {
  const repoRoot = makeTempRepo();
  const result = scaffoldPartnerPlugins({ repoRoot, requestedHosts: ["openclaw"] });
  assert.equal(result.generated.length, 1);
  assert.equal(result.generated[0].pluginId, "openaegis-openclaw");
  assert.deepEqual(result.missingHosts, []);

  const manifestPath = path.join(repoRoot, "data", "plugins", "openaegis-openclaw", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.partnerHost.name, "OpenClaw");
  assert.equal(manifest.version, "1.2.3");
  assert.ok(manifest.distribution.packagePath);
  assert.equal(manifest.adoption.targets.weeklyInstalls, 9);
  assert.ok(Array.isArray(manifest.permissions));

  const packageDir = path.join(repoRoot, "partners", "openaegis-openclaw");
  assert.ok(fs.existsSync(path.join(packageDir, "package.json")));
  assert.ok(fs.existsSync(path.join(packageDir, "index.js")));
  assert.ok(fs.existsSync(path.join(packageDir, "src", "index.js")));
  assert.ok(fs.existsSync(path.join(packageDir, "openaegis.plugin.json")));
});

test("scaffoldPartnerPlugins writes Flowise adapter files", () => {
  const repoRoot = makeTempRepo();
  scaffoldPartnerPlugins({ repoRoot, requestedHosts: ["flowise"] });
  const packageDir = path.join(repoRoot, "partners", "openaegis-flowise");
  assert.ok(fs.existsSync(path.join(packageDir, "src", "adapters", "flowise", "OpenAegisFlowiseNode.js")));
  assert.ok(fs.existsSync(path.join(packageDir, "src", "adapters", "flowise", "flowise.node.json")));
});

test("scaffoldPartnerPlugins writes n8n community-node shape", () => {
  const repoRoot = makeTempRepo();
  scaffoldPartnerPlugins({ repoRoot, requestedHosts: ["n8n"] });
  const packageDir = path.join(repoRoot, "partners", "openaegis-n8n");
  assert.ok(fs.existsSync(path.join(packageDir, "nodes", "OpenAegis", "OpenAegis.node.js")));
  assert.ok(fs.existsSync(path.join(packageDir, "credentials", "OpenAegisApi.credentials.js")));
});

test("scaffoldPartnerPlugins writes Langflow component schema", () => {
  const repoRoot = makeTempRepo();
  scaffoldPartnerPlugins({ repoRoot, requestedHosts: ["langflow"] });
  const packageDir = path.join(repoRoot, "partners", "openaegis-langflow");
  assert.ok(fs.existsSync(path.join(packageDir, "langflow", "OpenAegisComponent.schema.json")));
  assert.ok(fs.existsSync(path.join(packageDir, "langflow", "OpenAegisComponent.py")));
});

test("scaffoldPartnerPlugins reports unknown host ids", () => {
  const repoRoot = makeTempRepo();
  const result = scaffoldPartnerPlugins({ repoRoot, requestedHosts: ["unknown-host"] });
  assert.equal(result.generated.length, 0);
  assert.deepEqual(result.missingHosts, ["unknown-host"]);
});
