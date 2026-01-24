import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return sha256(data);
}

export function cachePaths(cacheDir, id, format) {
  const filename = `${id}.${format}`;
  return {
    id,
    filename,
    outputPath: path.join(cacheDir, filename),
    metaPath: path.join(cacheDir, `${id}.json`)
  };
}
