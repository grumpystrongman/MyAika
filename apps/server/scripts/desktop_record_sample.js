import { recordDesktopMacro } from "../src/desktopRunner/recorder.js";
import { saveDesktopMacro } from "../src/desktopRunner/macros.js";

function shouldRun() {
  return String(process.env.DESKTOP_RECORD_SAMPLE_RUN || "0") === "1";
}

function shouldSave() {
  return String(process.env.DESKTOP_RECORD_SAMPLE_SAVE || "0") === "1";
}

function defaultName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `Recorded Macro ${stamp}`;
}

async function run() {
  if (process.platform !== "win32") {
    console.log(JSON.stringify({ ok: false, error: "windows_only" }, null, 2));
    return;
  }
  if (!shouldRun()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      message: "Set DESKTOP_RECORD_SAMPLE_RUN=1 to start recording (press F8 to stop)."
    }, null, 2));
    return;
  }

  const result = recordDesktopMacro({
    stopKey: process.env.DESKTOP_RECORD_STOP_KEY || "F8",
    maxSeconds: Number(process.env.DESKTOP_RECORD_MAX_SECONDS || 180),
    includeMoves: String(process.env.DESKTOP_RECORD_INCLUDE_MOUSE_MOVES || "0") === "1"
  });

  if (shouldSave()) {
    const macro = saveDesktopMacro({
      name: process.env.DESKTOP_RECORD_SAMPLE_NAME || defaultName(),
      description: "Recorded via desktop_record_sample.js",
      tags: ["recorded"],
      actions: result.actions,
      recording: result.recording
    });
    console.log(JSON.stringify({ ok: true, saved: true, macro, summary: result.summary }, null, 2));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

run().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
