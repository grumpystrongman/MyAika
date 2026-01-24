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
    const scriptPath = path.join(
      os.tmpdir(),
      `aika_sapi_${Date.now()}_${Math.random()}.ps1`
    );
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
    fs.writeFileSync(scriptPath, script, "utf-8");

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-textPath",
      textPath,
      "-outPath",
      outputPath,
      "-voice",
      voiceName || "",
      "-rate",
      String(rate)
    ];

    const child = spawn("powershell", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("close", code => {
      fs.unlinkSync(scriptPath);
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
    if (!fs.existsSync(outputPath)) {
      throw new Error("sapi_output_missing");
    }
    const size = fs.statSync(outputPath).size;
    if (size < 64) {
      throw new Error("sapi_output_too_small");
    }
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

export async function listSapiVoices() {
  return new Promise((resolve, reject) => {
    const script = `
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $speak.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
$voices | ConvertTo-Json
`;
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ];

    const child = spawn("powershell", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("close", code => {
      if (code !== 0) {
        return reject(new Error(stderr || "sapi_list_failed"));
      }
      try {
        const parsed = JSON.parse(stdout.trim() || "[]");
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (e) {
        reject(e);
      }
    });
  });
}
