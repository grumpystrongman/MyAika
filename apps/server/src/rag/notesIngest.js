import { ingestConnectorDocument } from "../connectors/ingest.js";

export async function ingestNoteToRag({ noteId, title, body, tags = [], sourceUrl = "", updatedAt }) {
  if (!noteId) return { ok: false, error: "note_id_required" };
  const text = String(body || "").trim();
  if (!text) return { ok: false, error: "note_body_required" };
  const meetingId = `rag:notes:note:${noteId}`;
  return ingestConnectorDocument({
    collectionId: "notes",
    sourceType: "note",
    meetingId,
    title: title || "Note",
    sourceUrl,
    text,
    tags,
    metadata: { noteId },
    occurredAt: updatedAt,
    force: true,
    replaceExisting: true
  });
}
