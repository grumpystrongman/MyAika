import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "../storage/db.js";
import { nowIso } from "../storage/utils.js";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const defaultLog = path.join(repoRoot, "data", "audit.log");
const maxSizeBytes = Number(process.env.AUDIT_LOG_MAX_BYTES || 5 * 1024 * 1024);

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function rotateIfNeeded(filePath) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  if (stat.size < maxSizeBytes) return;
  const rotated = `${filePath}.${Date.now()}`;
  fs.renameSync(filePath, rotated);
}

export function writeAudit(event) {
  const filePath = process.env.AUDIT_LOG_PATH || defaultLog;
  ensureDir(filePath);
  rotateIfNeeded(filePath);
  const line = JSON.stringify(event);
  fs.appendFileSync(filePath, line + "\n");
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_log (id, ts, action, detail_json) VALUES (?, ?, ?, ?)`
    ).run(
      event.id || crypto.randomUUID?.() || String(Date.now()),
      event.at || nowIso(),
      event.type || "audit",
      JSON.stringify(event)
    );
  } catch {
    // Ignore DB insert failures to avoid blocking core flow.
  }
}
