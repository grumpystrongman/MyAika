const base = process.env.SERVER_URL || "http://localhost:8790";

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

async function postStt(buffer, filename, mimeType) {
  const form = new FormData();
  form.append("audio", new Blob([buffer], { type: mimeType }), filename);
  const r = await fetch(`${base}/api/stt/transcribe`, { method: "POST", body: form });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function main() {
  const tests = [];
  const push = (name, ok, detail = "") => {
    tests.push({ name, ok, detail });
    console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  };

  try {
    const r = await fetch(`${base}/health`);
    push("health", r.ok, `status ${r.status}`);
  } catch (err) {
    push("health", false, err.message);
  }

  try {
    const payload = {
      text: "Hello Jeff \uDC9D this is robust piper unicode coverage.",
      settings: {
        engine: "piper",
        voiceName: process.env.PIPER_DEFAULT_VOICE || "en_GB-semaine-medium",
        format: "wav",
        use_raw_text: true
      }
    };
    const r = await fetch(`${base}/api/aika/voice/inline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    push("tts_inline_piper", r.ok, `status ${r.status}`);
  } catch (err) {
    push("tts_inline_piper", false, err.message);
  }

  try {
    const ttsPayload = {
      text: "This is a reliable speech-to-text validation phrase.",
      settings: {
        engine: "piper",
        voiceName: process.env.PIPER_DEFAULT_VOICE || "en_GB-semaine-medium",
        format: "wav",
        use_raw_text: true
      }
    };
    const ttsResp = await fetch(`${base}/api/aika/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ttsPayload)
    });
    const ttsData = await ttsResp.json().catch(() => ({}));
    if (!ttsResp.ok || !ttsData?.audioUrl) throw new Error(ttsData?.error || "tts_seed_failed");
    const audioResp = await fetch(`${base}${ttsData.audioUrl}`);
    const audioBuf = Buffer.from(await audioResp.arrayBuffer());
    const r = await postStt(audioBuf, "seed.wav", "audio/wav");
    const text = String(r.data?.text || "").trim();
    push("stt_valid_audio", r.ok && text.length > 0, r.ok ? text : (r.data?.error || `status ${r.status}`));
  } catch (err) {
    push("stt_valid_audio", false, err.message);
  }

  try {
    const silent = makeSilentWav(0.8);
    const r = await postStt(silent, "silence.wav", "audio/wav");
    const isExpectedReject = !r.ok && (r.data?.error === "audio_too_short" || r.data?.error === "transcription_failed");
    push("stt_silence_rejected", isExpectedReject, r.ok ? "unexpected_ok" : (r.data?.error || `status ${r.status}`));
  } catch (err) {
    push("stt_silence_rejected", false, err.message);
  }

  try {
    const r = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userText: "Hello Aika, reply in one sentence.", maxOutputTokens: 120 })
    });
    const data = await r.json().catch(() => ({}));
    const text = String(data?.text || "").trim();
    push("chat_reply", r.ok && text.length > 0, r.ok ? text.slice(0, 80) : (data?.error || `status ${r.status}`));
  } catch (err) {
    push("chat_reply", false, err.message);
  }

  const failed = tests.filter(t => !t.ok);
  if (failed.length) {
    console.error(`\nFull voice test FAILED (${failed.length}/${tests.length}).`);
    process.exit(1);
  }
  console.log(`\nFull voice test PASSED (${tests.length}/${tests.length}).`);
}

main();
