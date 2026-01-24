import fs from "node:fs";
import path from "node:path";
import { formatAikaVoice } from "./formatter.js";
import { normalizeSettings } from "./settings.js";
import { cacheDir, voicesDir, maxChars } from "./paths.js";
import { cachePaths, ensureDir, hashFile, sha256 } from "./cache.js";
import { readWavMeta } from "./wav_meta.js";
import { generateWithCoqui } from "./engine_coqui.js";
import { generateWithSapi } from "./engine_sapi.js";
import { generateWithStub } from "./engine_stub.js";

const ENGINE = process.env.TTS_ENGINE || (process.platform === "win32" ? "sapi" : "coqui");
const MODEL_ID =
  process.env.TTS_MODEL_ID || "tts_models/multilingual/multi-dataset/xtts_v2";

export function resolveVoicePath(rawPath) {
  if (!rawPath) return null;
  const resolved = path.resolve(voicesDir, rawPath);
  if (!resolved.startsWith(voicesDir)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export function resolveAudioPath(id) {
  if (!/^[a-f0-9]{64}\\.(wav|mp3)$/.test(id)) return null;
  const filePath = path.join(cacheDir, id);
  if (!filePath.startsWith(cacheDir)) return null;
  return filePath;
}

export async function generateAikaVoice({ text, settings = {} }) {
  if (!text || typeof text !== "string") {
    const err = new Error("text_required");
    err.status = 400;
    throw err;
  }
  if (text.length > maxChars) {
    const err = new Error(`text_too_long_${maxChars}`);
    err.status = 400;
    throw err;
  }

  const { settings: normalized, warnings } = normalizeSettings(settings);
  const formatted = formatAikaVoice(text, {
    style: normalized.style,
    pause: normalized.pause
  });

  if (normalized.pitch !== 0) warnings.push("pitch_ignored");
  if (normalized.energy !== 1.0) warnings.push("energy_ignored");
  if (normalized.rate !== 1.05) warnings.push("rate_ignored");

  const voicePath = resolveVoicePath(normalized.voice?.reference_wav_path);
  if (normalized.voice?.reference_wav_path && !voicePath) {
    warnings.push("reference_wav_path_invalid");
  }

  const voiceHash = voicePath ? hashFile(voicePath) : "";
  const hashInput = JSON.stringify({
    text: formatted,
    settings: {
      ...normalized,
      voice: { reference_wav_path: voicePath ? path.basename(voicePath) : "" }
    },
    model: MODEL_ID,
    voiceHash
  });
  const id = sha256(hashInput);
  ensureDir(cacheDir);

  const { outputPath, metaPath, filename } = cachePaths(cacheDir, id, normalized.format);
  if (fs.existsSync(outputPath) && fs.existsSync(metaPath)) {
    const cached = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    return {
      audioUrl: `/api/aika/voice/${filename}`,
      filePath: outputPath,
      meta: { ...cached, cacheHit: true },
      warnings
    };
  }

  if (normalized.format === "mp3" && process.env.TTS_ENABLE_MP3 !== "1") {
    const err = new Error("mp3_not_enabled");
    err.status = 400;
    throw err;
  }

  const payload = {
    text: formatted,
    output_path: outputPath,
    format: normalized.format,
    model_id: MODEL_ID,
    rate: normalized.rate,
    pitch: normalized.pitch,
    energy: normalized.energy,
    voice_path: voicePath
  };

  let engineMeta;
  if (ENGINE === "stub") {
    engineMeta = await generateWithStub({ outputPath });
  } else if (ENGINE === "sapi") {
    if (voicePath) warnings.push("reference_wav_path_ignored_for_sapi");
    engineMeta = await generateWithSapi({
      text: formatted,
      outputPath,
      rate: normalized.rate,
      voiceName: normalized.voice?.name
    });
  } else {
    engineMeta = await generateWithCoqui(payload);
  }

  let wavMeta = {};
  if (normalized.format === "wav") {
    wavMeta = readWavMeta(outputPath);
  }

  const meta = {
    id,
    format: normalized.format,
    sampleRate: wavMeta.sampleRate || engineMeta.sampleRate || null,
    duration: wavMeta.duration || engineMeta.duration || null,
    model: MODEL_ID,
    engine: engineMeta.engine,
    cacheHit: false
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return {
    audioUrl: `/api/aika/voice/${filename}`,
    filePath: outputPath,
    meta,
    warnings: [...warnings, ...(engineMeta.warnings || [])]
  };
}
