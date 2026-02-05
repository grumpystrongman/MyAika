import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db.js";
import { repoRoot, ensureDir, nowIso } from "./utils.js";

const cacheDir = path.join(repoRoot, "data", "cache", "spreadsheet_patches");

export function createSpreadsheetPatch({ targetType, targetRef, changes, diffMarkdown, googleDocId = null, googleDocUrl = null, userId = "local" }) {
  const db = getDb();
  ensureDir(cacheDir);
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  const cachePath = path.join(cacheDir, `${id}.md`);
  fs.writeFileSync(cachePath, diffMarkdown);
  db.prepare(
    `INSERT INTO spreadsheet_patches (id, target_type, target_ref, changes_json, diff_markdown, google_doc_id, google_doc_url, status, created_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    targetType,
    targetRef,
    JSON.stringify(changes || []),
    diffMarkdown,
    googleDocId,
    googleDocUrl,
    "draft",
    createdAt,
    userId
  );
  return { id, cachePath, diffMarkdown };
}
