import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pythonBin, ttsScriptPath } from "./paths.js";

function runPython(inputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [ttsScriptPath, "--input", inputPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });

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
        const err = new Error(stderr || stdout || "tts_failed");
        err.code = code;
        return reject(err);
      }
      try {
        const json = JSON.parse(stdout.trim() || "{}");
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function generateWithCoqui(payload) {
  const tmpFile = path.join(os.tmpdir(), `aika_tts_${Date.now()}_${Math.random()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(payload), "utf-8");
  try {
    const result = await runPython(tmpFile);
    return {
      engine: "coqui",
      sampleRate: result.sample_rate || null,
      duration: result.duration || null,
      warnings: result.warnings || []
    };
  } finally {
    fs.unlinkSync(tmpFile);
  }
}
