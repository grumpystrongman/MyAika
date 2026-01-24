import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readWavMeta } from "./wav_meta.js";

function mapRate(rate = 1.05) {
  const clamped = Math.max(0.8, Math.min(1.3, rate));
  const scaled = Math.round((clamped - 1) * 10);
  return Math.max(-4, Math.min(4, scaled));
}

function runPowerShell({ textPath, outputPath, voiceName, rate }) {
  return new Promise((resolve, reject) => {
    const script = `
param([string]$textPath,[string]$outPath,[string]$voice,[int]$rate)
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($voice -and $voice.Trim().Length -gt 0) { $speak.SelectVoice($voice) }
$speak.Rate = $rate
$text = Get-Content -Raw -Path $textPath
$speak.SetOutputToWaveFile($outPath)
$speak.Speak($text)
$speak.SetOutputToNull()
`;

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
      textPath,
      outputPath,
      voiceName || "",
      String(rate)
    ];

    const child = spawn("powershell", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("close", code => {
      if (code !== 0) {
        return reject(new Error(stderr || "sapi_failed"));
      }
      resolve();
    });
  });
}

export async function generateWithSapi({ text, outputPath, rate, voiceName }) {
  const tmpText = path.join(os.tmpdir(), `aika_tts_${Date.now()}_${Math.random()}.txt`);
  fs.writeFileSync(tmpText, text, "utf-8");
  try {
    await runPowerShell({
      textPath: tmpText,
      outputPath,
      voiceName,
      rate: mapRate(rate)
    });
    const meta = readWavMeta(outputPath);
    return {
      engine: "sapi",
      sampleRate: meta.sampleRate,
      duration: meta.duration,
      warnings: ["sapi_voice_used"]
    };
  } finally {
    fs.unlinkSync(tmpText);
  }
}
