import { createNoteRecord, searchNotes } from "../../storage/notes.js";
import { createGoogleDocInFolder, ensureDriveFolderPath } from "../../integrations/google.js";
import { ingestNoteToRag } from "../../src/rag/notesIngest.js";

export async function createNote({ title, body, content, tags = [], store = { googleDocs: true, localMarkdown: true } }, context = {}) {
  const resolvedBody = body ?? content ?? "";
  if (!title || !resolvedBody) {
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
    body: resolvedBody,
    tags,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    userId
  });
  let rag = null;
  try {
    rag = await ingestNoteToRag({
      noteId: record.id,
      title,
      body: resolvedBody,
      tags,
      sourceUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : "",
      updatedAt: new Date().toISOString()
    });
  } catch {
    rag = null;
  }
  return {
    id: record.id,
    markdownPath: record.cachePath,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    rag
  };
}

export function searchNotesTool({ query, tags = [], limit = 20 }, context = {}) {
  return searchNotes({ query, tags, limit, userId: context.userId || "local" });
}
