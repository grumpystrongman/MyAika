# Verification Checklist
Generated: 2026-02-20

## RAG Model Portability
- [ ] Settings ? Knowledge ? Download RAG Backup returns a zip file.
- [ ] Settings ? Knowledge ? Export RAG Models downloads JSON.
- [ ] Settings ? Knowledge ? Import RAG Models restores custom collections + sources.
- [ ] Default RAG model dropdown still loads and saves.

## API Sanity
- [ ] `GET /api/rag/backup/download` returns `application/zip` with a filename.
- [ ] `GET /api/rag/models/export` returns JSON with `models` + `sources`.
- [ ] `POST /api/rag/models/import` returns counts.

## Automated Tests
- [x] `npm test`
