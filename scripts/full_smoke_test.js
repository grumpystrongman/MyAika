// Full smoke test runner
// Usage: node scripts/full_smoke_test.js
import { spawn } from "node:child_process";

const BASE = process.env.MCP_BASE_URL || "http://127.0.0.1:8790";

const steps = [];
const isWin = process.platform === "win32";

function addStep(name, cmd, args, optional = false) {
  steps.push({ name, cmd, args, optional });
}

function runStep(step) {
  return new Promise(resolve => {
    console.log(`\n==> ${step.name}`);
    const child = spawn(step.cmd, step.args, { stdio: "inherit", shell: true });
    child.on("exit", code => resolve({ step, code: code ?? 1 }));
  });
}

addStep("unit tests", "npm", ["test"]);
addStep("mcp smoke", "node", ["scripts/mcp_smoke_test.js"]);
addStep("mcp features smoke", "node", ["scripts/mcp_features_smoke.js"]);
addStep("recordings smoke", "node", ["scripts/recordings_smoke.js"]);
addStep("voice smoke", "npm", ["run", "voice:smoke"]);
addStep("voice fulltest", "npm", ["run", "voice:test"]);

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
