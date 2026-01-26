import fs from "node:fs";
import { readWavMeta } from "./wav_meta.js";

const DEFAULT_URL = process.env.GPTSOVITS_URL || "http://127.0.0.1:9880/tts";
const DEFAULT_TEXT_LANG = process.env.GPTSOVITS_TEXT_LANG || "en";
const DEFAULT_PROMPT_LANG = process.env.GPTSOVITS_PROMPT_LANG || "en";

export async function generateWithGptSovits({
  text,
  outputPath,
  refWavPath,
  promptText,
  language = DEFAULT_TEXT_LANG,
  rate = 1.0
}) {
  const payload = {
    text,
    text_lang: language,
    ref_audio_path: refWavPath || "",
    prompt_text: promptText || "",
    prompt_lang: DEFAULT_PROMPT_LANG,
    speed_factor: Number(rate) || 1.0,
    media_type: "wav",
    streaming_mode: false
  };

  const r = await fetch(DEFAULT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const msg = await r.text();
    throw new Error(`gptsovits_failed (${r.status}): ${msg || "unknown"}`);
  }

  const audioBuf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(outputPath, audioBuf);

  if (!fs.existsSync(outputPath)) {
    throw new Error("gptsovits_output_missing");
  }

  const meta = readWavMeta(outputPath);
  return {
    engine: "gptsovits",
    sampleRate: meta.sampleRate,
    duration: meta.duration,
    warnings: []
  };
}
