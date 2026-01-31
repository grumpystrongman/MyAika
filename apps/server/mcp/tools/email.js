import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const draftsFile = path.join(repoRoot, "data", "email_drafts.json");

function ensureDir() {
  const dir = path.dirname(draftsFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadDrafts() {
  try {
    if (!fs.existsSync(draftsFile)) return [];
    return JSON.parse(fs.readFileSync(draftsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveDrafts(items) {
  ensureDir();
  fs.writeFileSync(draftsFile, JSON.stringify(items, null, 2));
}

export function draftReply({ to, subject, body }) {
  const drafts = loadDrafts();
  const item = {
    id: Date.now().toString(36),
    to,
    subject,
    body,
    status: "draft",
    createdAt: new Date().toISOString()
  };
  drafts.push(item);
  saveDrafts(drafts);
  return item;
}

export function sendEmail({ draftId }) {
  const drafts = loadDrafts();
  const item = drafts.find(d => d.id === draftId);
  if (!item) {
    const err = new Error("draft_not_found");
    err.status = 404;
    throw err;
  }
  item.status = "send_requested";
  saveDrafts(drafts);
  return {
    status: "stubbed",
    message: "Provider integration not configured. TODO: wire to email provider.",
    draft: item
  };
}

