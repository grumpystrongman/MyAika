function clamp(n, min, max) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

export function normalizeSettings(input = {}) {
  const warnings = [];
  const style = typeof input.style === "string" ? input.style : "brat_baddy";
  const format = input.format === "mp3" ? "mp3" : "wav";

  const rate = clamp(input.rate ?? 1.05, 0.8, 1.3);
  const pitch = clamp(input.pitch ?? 0, -5, 5);
  const energy = clamp(input.energy ?? 1.0, 0.5, 1.5);
  const pause = clamp(input.pause ?? 1.1, 0.8, 1.8);

  const voice = {};
  if (input.voice && typeof input.voice.reference_wav_path === "string") {
    voice.reference_wav_path = input.voice.reference_wav_path;
  }
  if (input.voice && typeof input.voice.name === "string") {
    voice.name = input.voice.name;
  }

  if (input.format && input.format !== "wav" && input.format !== "mp3") {
    warnings.push(`Unsupported format "${input.format}", using wav.`);
  }

  return {
    settings: { style, format, rate, pitch, energy, pause, voice },
    warnings
  };
}
