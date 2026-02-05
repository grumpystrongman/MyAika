// Full smoke test runner
// Usage: node scripts/full_smoke_test.js
const { spawn } = require("node:child_process");

const BASE = process.env.MCP_BASE_URL || "http://127.0.0.1:8790";
const NPM_CMD = "npm";
const NODE_CMD = process.execPath;

const steps = [];
const isWin = process.platform === "win32";

function addStep(name, cmd, args, optional = false, useCmd = false) {
  steps.push({ name, cmd, args, optional, useCmd });
}

function runStep(step) {
  return new Promise(resolve => {
    console.log(`\n==> ${step.name}`);
    const shouldWrap = process.platform === "win32" && step.useCmd;
    const cmd = shouldWrap ? "cmd.exe" : step.cmd;
    const args = shouldWrap ? ["/d", "/s", "/c", step.cmd, ...step.args] : step.args;
    const child = spawn(cmd, args, { stdio: "inherit", shell: false });
    child.on("exit", code => resolve({ step, code: code ?? 1 }));
  });
}

addStep("unit tests", NPM_CMD, ["test"], false, true);
addStep("mcp smoke", NODE_CMD, ["scripts/mcp_smoke_test.js"]);
addStep("mcp features smoke", NODE_CMD, ["scripts/mcp_features_smoke.js"]);
addStep("ui smoke", NODE_CMD, ["scripts/ui_smoke.js"]);
addStep("recordings smoke", NODE_CMD, ["scripts/recordings_smoke.js"]);
addStep("voice smoke", NPM_CMD, ["run", "voice:smoke"], false, true);
addStep("voice fulltest", NPM_CMD, ["run", "voice:test"], false, true);

if (isWin && process.env.SMOKE_SKIP_GOOGLE !== "true") {
  addStep("google smoke", "powershell", ["-ExecutionPolicy", "Bypass", "-File", "scripts/google_smoke_test.ps1"], true);
}

(async () => {
  try {
    const health = await fetch(`${BASE}/health`);
    if (!health.ok) throw new Error(`health status ${health.status}`);
  } catch (err) {
    console.error(`Health check failed at ${BASE}: ${err.message}`);
    process.exit(1);
  }

  let failures = 0;
  let warnings = 0;
  for (const step of steps) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runStep(step);
    if (result.code !== 0) {
      if (step.optional) {
        warnings += 1;
        console.warn(`WARN: ${step.name} failed (optional).`);
      } else {
        failures += 1;
        console.error(`FAIL: ${step.name} failed.`);
      }
    }
  }

  console.log(`\nSmoke summary: ${failures} failed, ${warnings} warnings.`);
  if (failures) process.exit(1);
})();
