import { createSpreadsheetPatch } from "../../storage/spreadsheet.js";
import { createGoogleDocInFolder, ensureDriveFolderPath } from "../../integrations/google.js";

function buildDiffMarkdown(target, changes) {
  const lines = [
    `# Spreadsheet Patch`,
    `Target: ${target.type} ${target.pathOrId}`,
    "\n## Changes"
  ];
  for (const change of changes || []) {
    lines.push(`- ${change.op} ${change.ref || ""} ${change.value !== undefined ? `=> ${JSON.stringify(change.value)}` : ""}`.trim());
  }
  return lines.join("\n");
}

export async function applyChanges({ target, changes = [], draftOnly = true }, context = {}) {
  if (!target?.type || !target?.pathOrId) {
    const err = new Error("target_required");
    err.status = 400;
    throw err;
  }
  const userId = context.userId || "local";
  const diffMarkdown = buildDiffMarkdown(target, changes);
  let doc = null;
  try {
    const folderId = await ensureDriveFolderPath(["Aika", "SpreadsheetPatches"], userId);
    doc = await createGoogleDocInFolder(`Spreadsheet Patch ${new Date().toISOString()}`, diffMarkdown, folderId, userId);
  } catch {
    doc = null;
  }
  const record = createSpreadsheetPatch({
    targetType: target.type,
    targetRef: target.pathOrId,
    changes,
    diffMarkdown,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    userId
  });
  return {
    id: record.id,
    diffMarkdown,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    draftOnly: Boolean(draftOnly)
  };
}
