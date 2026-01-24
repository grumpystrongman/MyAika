import { writeSineWav } from "./wav_meta.js";

export async function generateWithStub({ outputPath }) {
  writeSineWav(outputPath, { duration: 0.3, sampleRate: 22050, freq: 440 });
  return {
    engine: "stub",
    sampleRate: 22050,
    duration: 0.3,
    warnings: ["stub_tts_engine"]
  };
}
