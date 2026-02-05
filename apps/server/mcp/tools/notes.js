import { createNoteRecord, searchNotes } from "../../storage/notes.js";
import { createGoogleDocInFolder, ensureDriveFolderPath } from "../../integrations/google.js";

export async function createNote({ title, body, tags = [], store = { googleDocs: true, localMarkdown: true } }, context = {}) {
  if (!title || !body) {
    const err = new Error("title_body_required");
    err.status = 400;
    throw err;
  }
  const userId = context.userId || "local";
  let doc = null;
  if (store?.googleDocs) {
    try {
      const folderId = await ensureDriveFolderPath(["Aika", "Notes"], userId);
      doc = await createGoogleDocInFolder(title, `# ${title}\n\n${body}\n`, folderId, userId);
    } catch {
      doc = null;
    }
  }
  const record = createNoteRecord({
    title,
    body,
    tags,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    userId
  });
  return {
    id: record.id,
    markdownPath: record.cachePath,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null
  };
}

export function searchNotesTool({ query, tags = [], limit = 20 }, context = {}) {
  return searchNotes({ query, tags, limit, userId: context.userId || "local" });
}
