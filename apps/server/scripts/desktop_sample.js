import { runDesktopPlan } from "../src/desktopRunner/runner.js";

async function run() {
  if (process.platform !== "win32") {
    console.log(JSON.stringify({ ok: false, error: "windows_only" }, null, 2));
    return;
  }
  if (String(process.env.DESKTOP_SAMPLE_RUN || "0") !== "1") {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      message: "Set DESKTOP_SAMPLE_RUN=1 to execute a safe sample plan."
    }, null, 2));
    return;
  }

  const plan = {
    taskName: "Sample: Notepad hello",
    actions: [
      { type: "launch", target: "notepad.exe" },
      { type: "wait", ms: 800 },
      { type: "type", text: "Hello from Aika desktop runner." },
      { type: "wait", ms: 300 },
      { type: "screenshot", name: "notepad_hello" }
    ],
    safety: { requireApprovalFor: ["launch", "input", "screenshot"], maxActions: 20 }
  };

  const result = await runDesktopPlan(plan, { userId: "local", workspaceId: "default" });
  console.log(JSON.stringify(result, null, 2));
}

run().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
