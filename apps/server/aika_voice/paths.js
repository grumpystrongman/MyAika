import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(serverRoot, "..", "..");

function resolveFromRepo(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

export const cacheDir = resolveFromRepo(
  process.env.TTS_CACHE_DIR,
  path.join(repoRoot, "data", "aika_tts_cache")
);

export const voicesDir = resolveFromRepo(
  process.env.TTS_VOICES_DIR,
  path.join(serverRoot, "voices")
);

export const ttsServiceDir = path.resolve(repoRoot, "tts_service");
export const ttsScriptPath = path.join(ttsServiceDir, "generate_tts.py");
export const pythonBin = process.env.TTS_PYTHON_BIN || "python";
export const maxChars = Number(process.env.TTS_MAX_CHARS || 600);
