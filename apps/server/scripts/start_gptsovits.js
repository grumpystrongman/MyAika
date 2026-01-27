import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const repoRoot = path.resolve(process.cwd());
const envPath = path.join(repoRoot, "apps", "server", ".env");
dotenv.config({ path: envPath });

const repoPath = process.env.GPTSOVITS_REPO_PATH;
if (!repoPath) {
  console.error("GPTSOVITS_REPO_PATH not set in apps/server/.env");
  process.exit(1);
}

const pythonBin = process.env.GPTSOVITS_PYTHON_BIN || "python";
const port = process.env.GPTSOVITS_PORT || "9882";
const bindAddr = process.env.GPTSOVITS_BIND || "0.0.0.0";
const defaultConfig = path.join(repoRoot, "apps", "server", "gptsovits_tts_infer_v3.yaml");
const configPath =
  process.env.GPTSOVITS_CONFIG ||
  (fs.existsSync(defaultConfig) ? defaultConfig : "GPT_SoVITS/configs/tts_infer.yaml");

const scriptPath = path.join(repoPath, "api_v2.py");
const args = [scriptPath, "-a", bindAddr, "-p", port, "-c", configPath];

const ffmpegBin = path.join(repoRoot, "tools", "ffmpeg", "ffmpeg-master-latest-win64-gpl-shared", "bin");
if (fs.existsSync(ffmpegBin)) {
  process.env.PATH = `${ffmpegBin};${process.env.PATH || ""}`;
}

const child = spawn(pythonBin, args, {
  cwd: repoPath,
  stdio: "inherit",
  env: process.env
});

child.on("exit", code => {
  process.exit(code ?? 0);
});
