import { createNoteRecord, searchNotes } from "../../storage/notes.js";
import { createGoogleDocInFolder, ensureDriveFolderPath } from "../../integrations/google.js";

export async function createNote({ title, body, tags = [], store = { googleDocs: true, localMarkdown: true } }) {
  if (!title || !body) {
    const err = new Error("title_body_required");
    err.status = 400;
    throw err;
  }
  let doc = null;
  if (store?.googleDocs) {
    try {
      const folderId = await ensureDriveFolderPath(["Aika", "Notes"]);
      doc = await createGoogleDocInFolder(title, `# ${title}\n\n${body}\n`, folderId);
    } catch {
      doc = null;
    }
  }
  const record = createNoteRecord({
    title,
    body,
    tags,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null
  });
  return {
    id: record.id,
    markdownPath: record.cachePath,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null
  };
}

export function searchNotesTool({ query, tags = [], limit = 20 }) {
  return searchNotes({ query, tags, limit });
}
