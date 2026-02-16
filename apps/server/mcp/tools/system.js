import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const operations = {
  restart: {
    label: "Restart Aika server + web",
    script: "scripts/start_myaika.ps1",
    delaySec: 2
  },
  register_startup: {
    label: "Register MyAika startup task",
    script: "scripts/register_myaika_startup.ps1",
    delaySec: 0
  }
};

function spawnPowerShell(scriptPath, delaySec = 0) {
  const escaped = scriptPath.replace(/\"/g, "\"\"");
  const command = delaySec > 0
    ? `Start-Sleep -Seconds ${delaySec}; & \"${escaped}\"`
    : `& \"${escaped}\"`;
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { cwd: repoRoot, detached: true, stdio: "ignore" }
  );
  child.unref();
}

export async function systemModify(params = {}) {
  const op = String(params.operation || params.action || "").trim().toLowerCase();
  if (!op || op === "list" || op === "help") {
    return {
      ok: true,
      operations: Object.entries(operations).map(([key, meta]) => ({
        key,
        label: meta.label,
        script: meta.script
      }))
    };
  }
  const entry = operations[op];
  if (!entry) {
    const err = new Error("unknown_operation");
    err.status = 400;
    throw err;
  }
  const scriptPath = path.resolve(repoRoot, entry.script);
  if (!fs.existsSync(scriptPath)) {
    const err = new Error("script_not_found");
    err.status = 404;
    throw err;
  }
  spawnPowerShell(scriptPath, entry.delaySec || 0);
  return { ok: true, operation: op, script: entry.script };
}
