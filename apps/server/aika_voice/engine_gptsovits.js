import fs from "node:fs";
import { readWavMeta } from "./wav_meta.js";

const DEFAULT_URL = process.env.GPTSOVITS_URL || "http://127.0.0.1:9880/tts";
const DEFAULT_TEXT_LANG = process.env.GPTSOVITS_TEXT_LANG || "en";
const DEFAULT_PROMPT_LANG = process.env.GPTSOVITS_PROMPT_LANG || "en";
const DEFAULT_SPLIT_METHOD = process.env.GPTSOVITS_TEXT_SPLIT_METHOD || "cut5";
const FAST_SPLIT_METHOD = process.env.GPTSOVITS_FAST_SPLIT_METHOD || "cut5";
const DEFAULT_SAMPLE_STEPS = Number(process.env.GPTSOVITS_SAMPLE_STEPS || 32);
const FAST_SAMPLE_STEPS = Number(process.env.GPTSOVITS_FAST_SAMPLE_STEPS || 18);
const DEFAULT_PARALLEL_INFER =
  process.env.GPTSOVITS_PARALLEL_INFER === "0" ? false : true;
const DEFAULT_TOP_K = Number(process.env.GPTSOVITS_TOP_K || 5);
const DEFAULT_TOP_P = Number(process.env.GPTSOVITS_TOP_P || 1);
const DEFAULT_TEMPERATURE = Number(process.env.GPTSOVITS_TEMPERATURE || 1);
const DEFAULT_STREAMING_MODE = process.env.GPTSOVITS_STREAMING_MODE || "0";
const DEFAULT_MIN_CHUNK = Number(process.env.GPTSOVITS_MIN_CHUNK_LENGTH || 20);
const DEFAULT_OVERLAP = Number(process.env.GPTSOVITS_OVERLAP_LENGTH || 2);
const DEFAULT_REPETITION_PENALTY = Number(process.env.GPTSOVITS_REPETITION_PENALTY || 1.35);

export async function generateWithGptSovits({
  text,
  outputPath,
  refWavPath,
  promptText,
  language = DEFAULT_TEXT_LANG,
  rate = 1.0,
  fast = false
}) {
  const useFast = Boolean(fast);
  const splitMethod = useFast ? FAST_SPLIT_METHOD : DEFAULT_SPLIT_METHOD;
  const sampleSteps = useFast ? FAST_SAMPLE_STEPS : DEFAULT_SAMPLE_STEPS;
  const payload = {
    text,
    text_lang: language,
    ref_audio_path: refWavPath || "",
    prompt_text: promptText || "",
    prompt_lang: DEFAULT_PROMPT_LANG,
    speed_factor: Number(rate) || 1.0,
    media_type: "wav",
    streaming_mode: Number(DEFAULT_STREAMING_MODE) || 0,
    text_split_method: splitMethod,
    batch_size: 1,
    split_bucket: true,
    batch_threshold: 0.75,
    top_k: DEFAULT_TOP_K,
    top_p: DEFAULT_TOP_P,
    temperature: DEFAULT_TEMPERATURE,
    parallel_infer: DEFAULT_PARALLEL_INFER,
    sample_steps: Number.isFinite(sampleSteps) ? sampleSteps : DEFAULT_SAMPLE_STEPS,
    min_chunk_length: DEFAULT_MIN_CHUNK,
    overlap_length: DEFAULT_OVERLAP,
    repetition_penalty: DEFAULT_REPETITION_PENALTY
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
