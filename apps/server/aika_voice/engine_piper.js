import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { piperVoicesDir } from "./paths.js";
import { readWavMeta } from "./wav_meta.js";

function resolveVoicePath(voiceName) {
  if (!voiceName) return null;
  const baseName = voiceName.endsWith(".onnx") ? voiceName : `${voiceName}.onnx`;
  const resolved = path.isAbsolute(baseName)
    ? baseName
    : path.resolve(piperVoicesDir, baseName);
  if (!resolved.startsWith(piperVoicesDir)) return null;
  if (!fs.existsSync(resolved)) return null;
  const configPath = `${resolved}.json`;
  if (!fs.existsSync(configPath)) return null;
  return { modelPath: resolved, configPath };
}

function getPiperCommand() {
  const bin = process.env.PIPER_BIN;
  if (bin && bin.trim()) return { cmd: bin.trim(), args: [] };
  const python = process.env.PIPER_PYTHON_BIN || "python";
  return { cmd: python, args: ["-m", "piper"] };
}

function lengthScaleFromRate(rate) {
  const r = Number.isFinite(rate) ? rate : 1.0;
  if (r <= 0) return 1.0;
  return Math.max(0.5, Math.min(2.0, 1 / r));
}

export async function generateWithPiper({ text, outputPath, voiceName, rate = 1.0 }) {
  const voice = resolveVoicePath(voiceName);
  if (!voice) {
    const err = new Error("piper_voice_not_found");
    err.status = 400;
    throw err;
  }

  const { cmd, args } = getPiperCommand();
  const lengthScale = lengthScaleFromRate(rate);
  const spawnArgs = [
    ...args,
    "--model",
    voice.modelPath,
    "--config",
    voice.configPath,
    "--output_file",
    outputPath,
    "--length_scale",
    String(lengthScale)
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(cmd, spawnArgs, {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let errText = "";
    child.stderr.on("data", chunk => {
      errText += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(errText || `piper_failed_${code}`));
    });
    child.stdin.write(String(text || ""));
    child.stdin.end();
  });

  if (!fs.existsSync(outputPath)) {
    throw new Error("piper_output_missing");
  }

  const meta = readWavMeta(outputPath);
  return {
    engine: "piper",
    sampleRate: meta.sampleRate,
    duration: meta.duration,
    warnings: []
  };
}

export function listPiperVoices() {
  if (!fs.existsSync(piperVoicesDir)) return [];
  const files = fs.readdirSync(piperVoicesDir);
  return files
    .filter(f => f.endsWith(".onnx") && fs.existsSync(path.join(piperVoicesDir, `${f}.json`)))
    .map(f => ({
      id: f.replace(/\.onnx$/i, ""),
      label: f.replace(/\.onnx$/i, "")
    }));
}
