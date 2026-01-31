import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

export function createEmailDraft({ originalFrom, originalSubject, draftSubject, draftBody, to = [], cc = [], bcc = [] }) {
  const db = getDb();
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO email_drafts (id, original_from, original_subject, draft_subject, draft_body, to_json, cc_json, bcc_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    originalFrom,
    originalSubject,
    draftSubject,
    draftBody,
    JSON.stringify(to),
    JSON.stringify(cc),
    JSON.stringify(bcc),
    "draft",
    createdAt
  );
  return { id, draftSubject, draftBody, status: "draft", createdAt };
}

export function getEmailDraft(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM email_drafts WHERE id = ?`).get(id) || null;
}

export function updateEmailDraftStatus(id, status) {
  const db = getDb();
  db.prepare(`UPDATE email_drafts SET status = ? WHERE id = ?`).run(status, id);
}
