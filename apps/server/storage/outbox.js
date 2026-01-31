import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { repoRoot, ensureDir, nowIso } from "./utils.js";

const outboxDir = path.join(repoRoot, "data", "outbox", "sent");

export function writeOutbox(payload) {
  ensureDir(outboxDir);
  const id = crypto.randomBytes(8).toString("hex");
  const filePath = path.join(outboxDir, `${id}.json`);
  const record = { id, createdAt: nowIso(), ...payload };
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
  return { id, filePath, record };
}
