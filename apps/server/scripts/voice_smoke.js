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

  let audioUrl = "";
  try {
    const payload = {
      text: "Hello Jeff, this is a smoke test for Piper voice.",
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
    audioUrl = r.ok ? data.audioUrl : "";
    push("tts_piper", r.ok && !!audioUrl, r.ok ? (audioUrl || "") : (data.error || `status ${r.status}`));
  } catch (err) {
    push("tts_piper", false, err.message);
  }

  try {
    if (!audioUrl) throw new Error("tts_missing_audio_url");
    const audioResp = await fetch(`${base}${audioUrl}`);
    const audioBuf = Buffer.from(await audioResp.arrayBuffer());
    const form = new FormData();
    form.append("audio", new Blob([audioBuf], { type: "audio/wav" }), "smoke.wav");
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
