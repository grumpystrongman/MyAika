import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isTestEnv() {
  return process.env.NODE_ENV === "test" || process.argv.includes("--test") || process.env.AIKA_TEST_MODE === "1";
}

function resolveRepoRoot() {
  const override = process.env.AIKA_REPO_ROOT || "";
  if (override) return path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
  if (isTestEnv()) return path.join(os.tmpdir(), "aika_test_repo");
  return path.resolve(process.cwd(), "..", "..");
}

export const repoRoot = resolveRepoRoot();

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
