import fs from "node:fs";
import path from "node:path";
import { formatAikaVoice } from "./formatter.js";
import { normalizeSettings } from "./settings.js";
import { cacheDir, voicesDir, maxChars } from "./paths.js";
import { cachePaths, ensureDir, hashFile, sha256 } from "./cache.js";
import { readWavMeta } from "./wav_meta.js";
import { generateWithGptSovits } from "./engine_gptsovits.js";
import { normalizeReferenceWav } from "./voice_ref.js";
import { generateWithPiper, listPiperVoices } from "./engine_piper.js";

function writeStubWav(filePath, sampleRate = 22050, durationSec = 0.2) {
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
  fs.writeFileSync(filePath, buffer);
  return { sampleRate, duration: durationSec };
}

function getDefaultEngine() {
  if (process.env.TTS_ENGINE && process.env.TTS_ENGINE.trim()) {
    return process.env.TTS_ENGINE.trim().toLowerCase();
  }
  const piperBin = process.env.PIPER_BIN || process.env.PIPER_PYTHON_BIN;
  const piperVoices = listPiperVoices();
  if (piperBin && piperVoices.length) return "piper";
  return "gptsovits";
}

const ENGINE = getDefaultEngine();
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
  const selectedEngine =
    normalized.engine && (normalized.engine === "piper" || normalized.engine === "gptsovits")
      ? normalized.engine
      : ENGINE;
  const useRawText = settings.use_raw_text === true;
  const formatted = useRawText
    ? String(text).trim()
    : formatAikaVoice(text, {
        style: normalized.style,
        pause: normalized.pause
      });

  if (normalized.pitch !== 0) warnings.push("pitch_ignored");
  if (normalized.energy !== 1.0) warnings.push("energy_ignored");

  let voicePath = resolveVoicePath(normalized.voice?.reference_wav_path);
  if (normalized.voice?.reference_wav_path && !voicePath) {
    warnings.push("reference_wav_path_invalid");
  }
  if (voicePath && voicePath.endsWith(`${path.sep}fem_aika.wav`)) {
    const trimmedFem = path.join(voicesDir, "fem_aika_trim_6s.wav");
    if (fs.existsSync(trimmedFem)) {
      voicePath = trimmedFem;
    }
  }
  if (voicePath) {
    try {
      const normalizedRef = normalizeReferenceWav(voicePath);
      if (normalizedRef.trimmed) warnings.push("reference_wav_trimmed");
      voicePath = normalizedRef.path;
    } catch (err) {
      const detail = err?.detail ? ` (${err.detail})` : "";
      const e = new Error(`${err.message || "reference_wav_invalid"}${detail}`);
      e.status = 400;
      throw e;
    }
  }

  const piperVoiceName =
    normalized.voice?.name || process.env.PIPER_DEFAULT_VOICE || "en_GB-semaine-medium";
  const voiceHash = voicePath ? hashFile(voicePath) : piperVoiceName;
  const hashInput = JSON.stringify({
    text: formatted,
    settings: {
      ...normalized,
      voice: {
        reference_wav_path: voicePath ? path.basename(voicePath) : "",
        name: piperVoiceName
      },
      engine: selectedEngine
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

  const defaultPrompt =
    process.env.GPTSOVITS_DEFAULT_PROMPT_TEXT ||
    "Aika is a confident, playful, feminine assistant with a warm, witty tone.";
  let engineMeta;
  if (selectedEngine === "gptsovits") {
    const promptText = (normalized.voice?.prompt_text || "").trim() || defaultPrompt;
    engineMeta = await generateWithGptSovits({
      text: formatted,
      outputPath,
      refWavPath: voicePath,
      promptText,
      language: "en",
      rate: normalized.rate,
      fast: normalized.fast
    });
  } else if (selectedEngine === "piper") {
    if (normalized.format !== "wav") {
      const err = new Error("piper_wav_only");
      err.status = 400;
      throw err;
    }
    if (!piperVoiceName) {
      const err = new Error("piper_voice_required");
      err.status = 400;
      throw err;
    }
    if (normalized.voice?.prompt_text) warnings.push("prompt_text_ignored");
    engineMeta = await generateWithPiper({
      text: formatted,
      outputPath,
      voiceName: piperVoiceName,
      rate: normalized.rate
    });
  } else if (selectedEngine === "stub") {
    const meta = writeStubWav(outputPath);
    engineMeta = { engine: "stub", sampleRate: meta.sampleRate, duration: meta.duration };
  } else {
    const err = new Error("unsupported_tts_engine");
    err.status = 400;
    throw err;
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
