import fs from "node:fs";
import path from "node:path";

export const repoRoot = path.resolve(process.cwd(), "..", "..");

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
