// Recordings pipeline smoke test
// Usage: node scripts/recordings_smoke.js
const BASE = process.env.MCP_BASE_URL || "http://127.0.0.1:8790";
const SMOKE_USER = process.env.SMOKE_USER_ID || "smoke-user";

const headers = { "Content-Type": "application/json", "x-user-id": SMOKE_USER };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postJson(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function getJson(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "x-user-id": SMOKE_USER } });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function generateTtsAudio() {
  const payload = {
    text: "This is a short smoke test recording for Aika.",
    settings: {
      engine: "piper",
      voiceName: process.env.PIPER_DEFAULT_VOICE || "en_GB-semaine-medium",
      format: "wav",
      use_raw_text: true
    }
  };
  const r = await fetch(`${BASE}/api/aika/voice`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.audioUrl) {
    return { ok: false, error: data?.error || `tts_failed_${r.status}` };
  }
  const audioResp = await fetch(`${BASE}${data.audioUrl}`);
  const audioBuf = Buffer.from(await audioResp.arrayBuffer());
  return { ok: true, buffer: audioBuf };
}

function makeSilentWav(durationSec = 1.2, sampleRate = 22050) {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

async function run() {
  const results = [];
  const record = (name, ok, detail = "", warn = false) => {
    results.push({ name, ok, warn, detail });
    const tag = ok ? "OK " : warn ? "WARN" : "FAIL";
    console.log(`${tag} ${name}${detail ? ` - ${detail}` : ""}`);
  };

  const start = await postJson("/api/recordings/start", { title: "Smoke Recording" });
  if (!start.ok) {
    record("recording.start", false, start.data?.error || `status ${start.status}`);
    process.exit(1);
  }
  record("recording.start", true, start.data?.recording?.id || "");
  const recordingId = start.data?.recording?.id;

  let audioBuf = null;
  const tts = await generateTtsAudio();
  if (tts.ok) {
    audioBuf = tts.buffer;
    record("recording.audio_source", true, "tts");
  } else {
    audioBuf = makeSilentWav();
    record("recording.audio_source", false, "tts_failed_using_silence", true);
  }

  const form = new FormData();
  form.append("audio", new Blob([audioBuf], { type: "audio/wav" }), "smoke.wav");
  const finalResp = await fetch(`${BASE}/api/recordings/${recordingId}/final`, {
    method: "POST",
    headers: { "x-user-id": SMOKE_USER },
    body: form
  });
  const finalData = await finalResp.json().catch(() => ({}));
  record("recording.final", finalResp.ok, finalResp.ok ? "uploaded" : (finalData?.error || `status ${finalResp.status}`));

  const stop = await postJson(`/api/recordings/${recordingId}/stop`, { durationSec: 3 });
  record("recording.stop", stop.ok, stop.ok ? "processing" : (stop.data?.error || `status ${stop.status}`));

  let status = "processing";
  let last = null;
  for (let i = 0; i < 20; i += 1) {
    await sleep(2000);
    const detail = await getJson(`/api/recordings/${recordingId}`);
    if (!detail.ok) continue;
    last = detail.data?.recording || null;
    status = last?.status || status;
    if (status === "ready" || status === "failed") break;
  }

  if (!last) {
    record("recording.status", false, "no_response");
  } else if (status === "ready") {
    record("recording.status", true, "ready");
  } else {
    const error = last?.processing_json?.error || "failed";
    const noKey = !process.env.OPENAI_API_KEY;
    record("recording.status", false, error, noKey);
  }

  if (last?.audioUrl) {
    const audioResp = await fetch(`${BASE}${last.audioUrl}`, {
      headers: { "x-user-id": SMOKE_USER }
    });
    record("recording.audio", audioResp.ok, audioResp.ok ? "available" : `status ${audioResp.status}`);
  } else {
    record("recording.audio", false, "missing_audio_url");
  }

  const failed = results.filter(r => !r.ok && !r.warn).length;
  if (failed) {
    console.error(`Recording smoke failed: ${failed} checks failed.`);
    process.exit(1);
  }
  console.log("Recording smoke passed.");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
