import fs from "node:fs";
import path from "node:path";

const base = process.env.SERVER_URL || "http://localhost:8790";

async function main() {
  const results = [];
  const push = (name, ok, detail = "") => {
    results.push({ name, ok, detail });
    const icon = ok ? "OK " : "FAIL";
    console.log(`${icon} ${name}${detail ? ` - ${detail}` : ""}`);
  };

  try {
    const h = await fetch(`${base}/health`);
    push("health", h.ok, `status ${h.status}`);
  } catch (err) {
    push("health", false, err.message);
  }

  try {
    const payload = {
      text: "Hello Jeff \uDC9D this is a smoke test for piper.",
      settings: {
        engine: "piper",
        voiceName: process.env.PIPER_DEFAULT_VOICE || "en_GB-semaine-medium",
        format: "wav",
        use_raw_text: true
      }
    };
    const r = await fetch(`${base}/api/aika/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    push("tts_piper_unicode", r.ok && !!data.audioUrl, r.ok ? (data.audioUrl || "") : (data.error || `status ${r.status}`));
  } catch (err) {
    push("tts_piper_unicode", false, err.message);
  }

  try {
    const audioPath = path.resolve("apps/server/voices/fem_aika.wav");
    const buf = fs.readFileSync(audioPath);
    const form = new FormData();
    form.append("audio", new Blob([buf], { type: "audio/wav" }), "fem_aika.wav");
    const r = await fetch(`${base}/api/stt/transcribe`, { method: "POST", body: form });
    const data = await r.json().catch(() => ({}));
    push("stt_transcribe", r.ok && typeof data.text === "string", r.ok ? (data.text || "(empty)") : (data.error || `status ${r.status}`));
  } catch (err) {
    push("stt_transcribe", false, err.message);
  }

  const failed = results.filter(r => !r.ok).length;
  if (failed) {
    console.error(`Smoke failed: ${failed} checks failed.`);
    process.exit(1);
  }
  console.log("Smoke passed.");
}

main();
