import fs from "node:fs";
import path from "node:path";

function resolveRepoRoot(cwd = process.cwd()) {
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

function nowIso() {
  return new Date().toISOString();
}

function toPosixPath(value = "") {
  return String(value || "").replace(/\\/g, "/");
}

function normalizeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function uniq(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean))];
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw ? JSON.parse(raw) : {};
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function parseHostArg(argv = []) {
  const hosts = [];
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current !== "--host") continue;
    const next = argv[i + 1] || "";
    next.split(",").map(item => item.trim()).filter(Boolean).forEach(item => hosts.push(normalizeId(item)));
  }
  return uniq(hosts);
}

function parseConfigArg(argv = []) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--config") continue;
    const value = argv[i + 1];
    if (value) return value;
  }
  return "";
}

function parseBoolFlag(argv = [], flag = "") {
  return argv.includes(flag);
}

function parsePackageRootArg(argv = []) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--package-root") continue;
    const value = argv[i + 1];
    if (value) return value;
  }
  return "";
}

function buildManifest({
  defaults,
  host,
  existingManifest,
  packagePathRelative,
  timestamp
}) {
  const hostId = normalizeId(host.id || host.name || "");
  if (!hostId) throw new Error("invalid_host_id");
  const pluginId = normalizeId(host.pluginId || `openaegis-${hostId}`);
  const permissions = uniq([...(defaults.permissions || []), ...(host.permissions || [])]);
  const capabilities = uniq([...(defaults.capabilities || []), ...(host.capabilities || [])]);
  const existingAdoption = existingManifest?.adoption || {};
  const existingMetrics = existingAdoption.metrics || {};
  const defaultsTargets = defaults.targets || {};
  const hostTargets = host.targets || {};

  const adoption = {
    targets: {
      weeklyInstalls: toNumberOrZero(hostTargets.weeklyInstalls || existingAdoption?.targets?.weeklyInstalls || defaultsTargets.weeklyInstalls || 10),
      weeklyActivations: toNumberOrZero(hostTargets.weeklyActivations || existingAdoption?.targets?.weeklyActivations || defaultsTargets.weeklyActivations || 5),
      weeklyRetention: toNumberOrZero(hostTargets.weeklyRetention || existingAdoption?.targets?.weeklyRetention || defaultsTargets.weeklyRetention || 3)
    },
    metrics: {
      installsTotal: toNumberOrZero(existingMetrics.installsTotal),
      activationsTotal: toNumberOrZero(existingMetrics.activationsTotal),
      retainedTotal: toNumberOrZero(existingMetrics.retainedTotal),
      churnTotal: toNumberOrZero(existingMetrics.churnTotal),
      activeWorkspacesEstimate: toNumberOrZero(existingMetrics.activeWorkspacesEstimate),
      lastEventAt: existingMetrics.lastEventAt || null
    },
    tracking: {
      eventsPath: "data/plugins/_adoption/events.jsonl",
      summaryCadence: "weekly"
    }
  };

  return {
    id: pluginId,
    name: host.pluginName || `OpenAegis for ${host.name || hostId}`,
    version: host.version || defaults.version || "0.1.0",
    description: host.description || `OpenAegis plugin adapter for ${host.name || hostId}.`,
    permissions,
    capabilities,
    entrypoint: host.entrypoint || defaults.entrypoint || "index.js",
    installCallToAction: host.installCallToAction || defaults.installCallToAction || "",
    partnerHost: {
      id: hostId,
      name: host.name || hostId,
      status: host.status || "planned",
      integrationType: host.integrationType || "adapter"
    },
    distribution: {
      availability: host.status === "prototype" ? "beta" : "planned",
      packagePath: packagePathRelative,
      packageName: host.packageName || `@openaegis/${pluginId}`,
      marketplace: host.marketplace || "",
      packCommand: `npm --prefix ${packagePathRelative} pack`,
      publishCommand: host.publishCommand || "npm publish",
      lastScaffoldedAt: timestamp
    },
    adoption,
    updatedAt: timestamp,
    createdAt: existingManifest?.createdAt || timestamp
  };
}

function pickHosts({ hosts, requestedHosts }) {
  if (!requestedHosts.length) return hosts;
  const byId = new Map(hosts.map(host => [normalizeId(host.id || host.name || ""), host]));
  return requestedHosts.map(id => byId.get(id)).filter(Boolean);
}

function buildReadme({ host, manifest }) {
  const hostName = host.name || manifest.partnerHost.id;
  const hostId = normalizeId(host.id || host.name || "");
  const hostAdapterSection = buildHostReadmeSection({ hostId });
  return `# ${manifest.name}

OpenAegis plugin package for ${hostName}.

## Install
1. Copy this package into your ${hostName} plugin directory or publish it as an npm package.
2. Configure the environment variables below.
3. Point ${hostName} plugin loader to \`${manifest.entrypoint}\`.

## Environment
- \`OPENAEGIS_BASE_URL\` (required): OpenAegis API base URL.
- \`OPENAEGIS_API_KEY\` (required): API key for OpenAegis endpoints.
- \`OPENAEGIS_TIMEOUT_MS\` (optional): HTTP timeout in milliseconds (default \`20000\`).

## Capabilities
${manifest.capabilities.map(item => `- \`${item}\``).join("\n")}

## Quick Check
\`\`\`bash
node ./src/index.js --self-check
\`\`\`

## Distribution
- Package name: \`${manifest.distribution.packageName}\`
- Pack command: \`${manifest.distribution.packCommand}\`
- Publish command: \`${manifest.distribution.publishCommand}\`

${hostAdapterSection}
`;
}

function buildPackageJson({ host, manifest, extraFilePaths = [], hostPackagePatch = {} }) {
  const files = uniq([
    "src",
    "index.js",
    "README.md",
    ".env.example",
    "openaegis.plugin.json",
    ...extraFilePaths
  ]);
  const base = {
    name: manifest.distribution.packageName,
    version: manifest.version,
    description: manifest.description,
    type: "module",
    main: manifest.entrypoint,
    files,
    scripts: {
      "self-check": "node ./src/index.js --self-check"
    },
    keywords: ["openaegis", "plugin", normalizeId(host.id || host.name || "")],
    license: "MIT"
  };
  return {
    ...base,
    ...hostPackagePatch,
    scripts: { ...(base.scripts || {}), ...(hostPackagePatch.scripts || {}) },
    keywords: uniq([...(base.keywords || []), ...(hostPackagePatch.keywords || [])]),
    files: uniq([...(base.files || []), ...(hostPackagePatch.files || [])])
  };
}

function buildEnvExample() {
  return [
    "OPENAEGIS_BASE_URL=http://127.0.0.1:8787",
    "OPENAEGIS_API_KEY=replace-me",
    "OPENAEGIS_TIMEOUT_MS=20000",
    ""
  ].join("\n");
}

function buildPluginDescriptor({ host, manifest }) {
  return {
    id: manifest.id,
    name: manifest.name,
    host: normalizeId(host.id || host.name || ""),
    version: manifest.version,
    description: manifest.description,
    entrypoint: manifest.entrypoint,
    config: [
      { key: "OPENAEGIS_BASE_URL", required: true, description: "OpenAegis API base URL" },
      { key: "OPENAEGIS_API_KEY", required: true, description: "OpenAegis API key" },
      { key: "OPENAEGIS_TIMEOUT_MS", required: false, description: "HTTP timeout in ms" }
    ],
    capabilities: manifest.capabilities
  };
}

function buildClientJs() {
  return `const DEFAULT_TIMEOUT_MS = Number(process.env.OPENAEGIS_TIMEOUT_MS || 20000);

function trimRightSlash(value = "") {
  return String(value || "").replace(/\\/+$/, "");
}

function resolveConfig() {
  const baseUrl = trimRightSlash(process.env.OPENAEGIS_BASE_URL || "");
  const apiKey = process.env.OPENAEGIS_API_KEY || "";
  if (!baseUrl) throw new Error("OPENAEGIS_BASE_URL is required");
  if (!apiKey) throw new Error("OPENAEGIS_API_KEY is required");
  return { baseUrl, apiKey, timeoutMs: DEFAULT_TIMEOUT_MS };
}

export async function openAegisRequest(path, { method = "GET", body } = {}) {
  const cfg = resolveConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), cfg.timeoutMs);
  try {
    const response = await fetch(\`\${cfg.baseUrl}\${path}\`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload?.error || payload?.message || "openaegis_request_failed";
      throw new Error(reason);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function healthCheck() {
  return openAegisRequest("/health");
}

export async function sendChat(userText, context = {}) {
  return openAegisRequest("/chat", {
    method: "POST",
    body: { userText, ...context }
  });
}

export async function runModule(moduleName, inputPayload = {}) {
  return openAegisRequest("/api/aika/modules/run", {
    method: "POST",
    body: { moduleName, inputPayload }
  });
}

export async function runRunbook(name, inputPayload = {}) {
  return openAegisRequest("/api/aika/runbooks/run", {
    method: "POST",
    body: { name, inputPayload }
  });
}
`;
}

function buildIndexJs({ host, manifest }) {
  const hostId = normalizeId(host.id || host.name || "");
  return `import { healthCheck, sendChat, runModule, runRunbook } from "./client.js";

export function create${manifest.id.replace(/-([a-z])/g, (_, x) => x.toUpperCase()).replace(/(^[a-z])/, x => x.toUpperCase())}Plugin() {
  return {
    id: "${manifest.id}",
    host: "${hostId}",
    name: "${manifest.name}",
    capabilities: ${JSON.stringify(manifest.capabilities)},
    actions: {
      healthCheck,
      sendChat,
      runModule,
      runRunbook
    }
  };
}

if (process.argv.includes("--self-check")) {
  healthCheck()
    .then(payload => {
      console.log("OpenAegis plugin self-check ok:", JSON.stringify(payload));
      process.exit(0);
    })
    .catch(err => {
      console.error("OpenAegis plugin self-check failed:", err?.message || err);
      process.exit(1);
    });
}
`;
}

function buildRootIndexJs() {
  return `export * from "./src/index.js";
`;
}

function buildFlowiseAdapterJs({ manifest }) {
  return `import { sendChat, runModule, runRunbook } from "../../client.js";

export const flowiseNodeMeta = {
  id: "${manifest.id}",
  name: "${manifest.name}",
  category: "Tools",
  description: "${manifest.description}",
  inputs: [
    { name: "mode", type: "string", options: ["chat", "module", "runbook"], default: "chat" },
    { name: "prompt", type: "string", default: "" },
    { name: "moduleName", type: "string", default: "" },
    { name: "runbookName", type: "string", default: "" }
  ]
};

export async function runFlowiseNode(input = {}) {
  const mode = String(input.mode || "chat").toLowerCase();
  if (mode === "module") {
    return runModule(input.moduleName || "", input.inputPayload || {});
  }
  if (mode === "runbook") {
    return runRunbook(input.runbookName || "", input.inputPayload || {});
  }
  const message = input.prompt || input.userText || "";
  return sendChat(message, input.context || {});
}
`;
}

function buildFlowiseSchema({ manifest }) {
  return {
    id: manifest.id,
    type: "flowise-node",
    label: manifest.name,
    description: manifest.description,
    icon: "tool",
    version: manifest.version,
    actions: ["chat", "module", "runbook"]
  };
}

function buildN8nNodeJs({ manifest }) {
  return `import { sendChat, runModule, runRunbook } from "../../src/client.js";

export class OpenAegis {
  description = {
    displayName: "OpenAegis",
    name: "openAegis",
    icon: "file:openaegis.svg",
    group: ["transform"],
    version: 1,
    description: "${manifest.description}",
    defaults: { name: "OpenAegis" },
    inputs: ["main"],
    outputs: ["main"],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        default: "chat",
        options: [
          { name: "Chat", value: "chat" },
          { name: "Run Module", value: "module" },
          { name: "Run Runbook", value: "runbook" }
        ]
      },
      { displayName: "Prompt", name: "prompt", type: "string", default: "", displayOptions: { show: { operation: ["chat"] } } },
      { displayName: "Module Name", name: "moduleName", type: "string", default: "", displayOptions: { show: { operation: ["module"] } } },
      { displayName: "Runbook Name", name: "runbookName", type: "string", default: "", displayOptions: { show: { operation: ["runbook"] } } }
    ]
  };

  async execute() {
    const items = this.getInputData();
    const returnData = [];
    for (let index = 0; index < items.length; index += 1) {
      const operation = this.getNodeParameter("operation", index, "chat");
      let payload;
      if (operation === "module") {
        payload = await runModule(this.getNodeParameter("moduleName", index, ""), {});
      } else if (operation === "runbook") {
        payload = await runRunbook(this.getNodeParameter("runbookName", index, ""), {});
      } else {
        payload = await sendChat(this.getNodeParameter("prompt", index, ""), {});
      }
      returnData.push({ json: payload });
    }
    return [returnData];
  }
}
`;
}

function buildN8nCredentialJs() {
  return `export class OpenAegisApi {
  name = "openAegisApi";
  displayName = "OpenAegis API";
  properties = [
    { displayName: "Base URL", name: "baseUrl", type: "string", default: "http://127.0.0.1:8787" },
    { displayName: "API Key", name: "apiKey", type: "string", typeOptions: { password: true }, default: "" }
  ];
}
`;
}

function buildLangflowSchema({ manifest }) {
  return {
    name: "OpenAegisComponent",
    display_name: manifest.name,
    description: manifest.description,
    category: "tools",
    icon: "zap",
    outputs: [{ name: "response", method: "run_model" }],
    inputs: [
      { name: "operation", display_name: "Operation", options: ["chat", "module", "runbook"], value: "chat" },
      { name: "prompt", display_name: "Prompt", value: "" },
      { name: "module_name", display_name: "Module Name", value: "" },
      { name: "runbook_name", display_name: "Runbook Name", value: "" }
    ]
  };
}

function buildLangflowComponentPy() {
  return `from langflow.custom import Component
from langflow.io import DropdownInput, MessageTextInput, Output
from langflow.schema import Data
import os
import requests


class OpenAegisComponent(Component):
    display_name = "OpenAegis"
    description = "OpenAegis runtime adapter component."
    icon = "zap"
    name = "OpenAegisComponent"

    inputs = [
        DropdownInput(name="operation", display_name="Operation", options=["chat", "module", "runbook"], value="chat"),
        MessageTextInput(name="prompt", display_name="Prompt", value=""),
        MessageTextInput(name="module_name", display_name="Module Name", value=""),
        MessageTextInput(name="runbook_name", display_name="Runbook Name", value="")
    ]

    outputs = [Output(display_name="Response", name="response", method="run_model")]

    def run_model(self) -> Data:
        base_url = os.getenv("OPENAEGIS_BASE_URL", "http://127.0.0.1:8787").rstrip("/")
        api_key = os.getenv("OPENAEGIS_API_KEY", "")
        headers = {"x-api-key": api_key, "Content-Type": "application/json"}
        operation = str(self.operation or "chat").lower()

        if operation == "module":
            endpoint = "/api/aika/modules/run"
            payload = {"moduleName": self.module_name or "", "inputPayload": {}}
        elif operation == "runbook":
            endpoint = "/api/aika/runbooks/run"
            payload = {"name": self.runbook_name or "", "inputPayload": {}}
        else:
            endpoint = "/chat"
            payload = {"userText": self.prompt or ""}

        resp = requests.post(f"{base_url}{endpoint}", json=payload, headers=headers, timeout=20)
        resp.raise_for_status()
        return Data(data=resp.json())
`;
}

function buildHostReadmeSection({ hostId }) {
  if (hostId === "flowise") {
    return `## Flowise Adapter
- Runtime adapter: \`src/adapters/flowise/OpenAegisFlowiseNode.js\`
- Schema: \`src/adapters/flowise/flowise.node.json\``;
  }
  if (hostId === "n8n") {
    return `## n8n Community Node Shape
- Node: \`nodes/OpenAegis/OpenAegis.node.js\`
- Credentials: \`credentials/OpenAegisApi.credentials.js\`
- Package metadata includes an \`n8n\` block.`;
  }
  if (hostId === "langflow") {
    return `## Langflow Component Schema
- Schema: \`langflow/OpenAegisComponent.schema.json\`
- Component stub: \`langflow/OpenAegisComponent.py\``;
  }
  return "";
}

function buildHostRuntimeSpec({ host, manifest }) {
  const hostId = normalizeId(host.id || host.name || "");
  if (hostId === "flowise") {
    return {
      files: [
        {
          path: "src/adapters/flowise/OpenAegisFlowiseNode.js",
          kind: "text",
          content: buildFlowiseAdapterJs({ manifest })
        },
        {
          path: "src/adapters/flowise/flowise.node.json",
          kind: "json",
          content: buildFlowiseSchema({ manifest })
        }
      ],
      packagePatch: {
        flowise: {
          node: "src/adapters/flowise/OpenAegisFlowiseNode.js",
          schema: "src/adapters/flowise/flowise.node.json"
        },
        keywords: ["flowise"]
      }
    };
  }
  if (hostId === "n8n") {
    return {
      files: [
        {
          path: "nodes/OpenAegis/OpenAegis.node.js",
          kind: "text",
          content: buildN8nNodeJs({ manifest })
        },
        {
          path: "credentials/OpenAegisApi.credentials.js",
          kind: "text",
          content: buildN8nCredentialJs()
        }
      ],
      packagePatch: {
        n8n: {
          n8nNodesApiVersion: 1,
          nodes: ["nodes/OpenAegis/OpenAegis.node.js"],
          credentials: ["credentials/OpenAegisApi.credentials.js"]
        },
        keywords: ["n8n", "community-node"]
      }
    };
  }
  if (hostId === "langflow") {
    return {
      files: [
        {
          path: "langflow/OpenAegisComponent.schema.json",
          kind: "json",
          content: buildLangflowSchema({ manifest })
        },
        {
          path: "langflow/OpenAegisComponent.py",
          kind: "text",
          content: buildLangflowComponentPy()
        }
      ],
      packagePatch: {
        langflow: {
          schema: "langflow/OpenAegisComponent.schema.json",
          component: "langflow/OpenAegisComponent.py"
        },
        keywords: ["langflow", "component"]
      }
    };
  }
  return { files: [], packagePatch: {} };
}

function scaffoldPackage({
  packageRoot,
  packagePathRelative,
  host,
  manifest,
  dryRun
}) {
  const packageDir = path.resolve(packageRoot, manifest.id);
  const srcDir = path.join(packageDir, "src");
  const hostRuntime = buildHostRuntimeSpec({ host, manifest });
  const coreFiles = [
    path.join(packageDir, "package.json"),
    path.join(packageDir, "README.md"),
    path.join(packageDir, ".env.example"),
    path.join(packageDir, "openaegis.plugin.json"),
    path.join(packageDir, "index.js"),
    path.join(srcDir, "client.js"),
    path.join(srcDir, "index.js")
  ];
  const extraFiles = hostRuntime.files.map(item => path.join(packageDir, item.path));
  const files = [...coreFiles, ...extraFiles];
  if (!dryRun) {
    files.forEach(filePath => ensureDir(path.dirname(filePath)));
    writeJson(files[0], buildPackageJson({
      host,
      manifest,
      extraFilePaths: hostRuntime.files.map(item => item.path),
      hostPackagePatch: hostRuntime.packagePatch
    }));
    writeText(files[1], buildReadme({ host, manifest }));
    writeText(files[2], buildEnvExample());
    writeJson(files[3], buildPluginDescriptor({ host, manifest }));
    writeText(files[4], buildRootIndexJs());
    writeText(files[5], buildClientJs());
    writeText(files[6], buildIndexJs({ host, manifest }));
    hostRuntime.files.forEach(item => {
      const targetPath = path.join(packageDir, item.path);
      if (item.kind === "json") {
        writeJson(targetPath, item.content);
      } else {
        writeText(targetPath, item.content);
      }
    });
  }
  return {
    packageDir,
    packagePathRelative,
    files: files.map(filePath => toPosixPath(path.relative(process.cwd(), filePath) || filePath))
  };
}

export function scaffoldPartnerPlugins({
  repoRoot = resolveRepoRoot(),
  configPath = "",
  requestedHosts = [],
  dryRun = false,
  includePackage = true,
  packageRoot = ""
} = {}) {
  const finalConfigPath = configPath || path.join(repoRoot, "config", "openaegis_partner_hosts.json");
  const registry = readJson(finalConfigPath);
  const defaults = registry.defaults || {};
  const hosts = Array.isArray(registry.hosts) ? registry.hosts : [];
  const selectedHosts = pickHosts({ hosts, requestedHosts });
  const timestamp = nowIso();
  const pluginsDir = path.join(repoRoot, "data", "plugins");
  const resolvedPackageRoot = path.resolve(repoRoot, packageRoot || "partners");

  if (!dryRun) ensureDir(pluginsDir);
  if (!dryRun && includePackage) ensureDir(resolvedPackageRoot);

  const results = selectedHosts.map(host => {
    const hostId = normalizeId(host.id || host.name || "");
    const pluginId = normalizeId(host.pluginId || `openaegis-${hostId}`);
    const manifestDir = path.join(pluginsDir, pluginId);
    const manifestFile = path.join(manifestDir, "manifest.json");
    const packagePathRelative = toPosixPath(path.relative(repoRoot, path.join(resolvedPackageRoot, pluginId)));
    const existingManifest = fs.existsSync(manifestFile) ? readJson(manifestFile) : null;
    const manifest = buildManifest({
      defaults,
      host,
      existingManifest,
      packagePathRelative,
      timestamp
    });
    const packageScaffold = includePackage
      ? scaffoldPackage({
          packageRoot: resolvedPackageRoot,
          packagePathRelative,
          host,
          manifest,
          dryRun
        })
      : null;
    if (!dryRun) {
      ensureDir(manifestDir);
      writeJson(manifestFile, manifest);
    }
    return { hostId, pluginId, manifestFile, manifest, package: packageScaffold };
  });

  const missingHosts = requestedHosts.filter(id => !results.some(item => item.hostId === id));
  return {
    configPath: finalConfigPath,
    packageRoot: resolvedPackageRoot,
    dryRun,
    requestedHosts,
    includePackage,
    generated: results,
    missingHosts
  };
}

export function parsePartnerPluginArgs(argv = []) {
  return {
    requestedHosts: parseHostArg(argv),
    configPath: parseConfigArg(argv),
    dryRun: parseBoolFlag(argv, "--dry-run"),
    includePackage: !parseBoolFlag(argv, "--no-package"),
    packageRoot: parsePackageRootArg(argv)
  };
}
