# Security

**Overview**
- AIKA is designed to run locally or in a small-group hosted environment with explicit allowlists and per-user isolation.
- Authentication uses Google OAuth for login, then mints an app JWT stored in an HttpOnly cookie.

**Data Isolation Model**
- Each request is bound to a user context (`user_id`, optional `tenant_id`) via AsyncLocalStorage.
- RAG data (documents, chunks, embeddings, HNSW index) is isolated per user by default when `RAG_MULTIUSER_ENABLED=1`.
- Conversation history is scoped by `user_id` in `chat_threads`, with message reads/writes guarded by user context.
- User-scoped storage uses `user_id` filters at the storage layer (not just in UI).

**Threat Model Notes**
- Cross-tenant leakage risks are mitigated by per-user RAG stores and user_id checks in storage queries.
- JWT theft is mitigated by HttpOnly cookies; use HTTPS in production to protect cookies in transit.
- Misconfiguration risks: leaving `AUTH_REQUIRED=0` disables auth gating; set it to `1` in hosted environments.
- Admin impersonation is guarded by strict scope checks when `AIKA_STRICT_USER_SCOPE=1`.

**Operational Guidance**
- Set `AUTH_REQUIRED=1`, `AUTH_JWT_SECRET=...`, `AIKA_STRICT_USER_SCOPE=1`, and `RAG_MULTIUSER_ENABLED=1` for hosted use.
- Configure the allowlist via env or `config/auth_allowlist.json` to restrict access.
- Store secrets in environment variables, not in the repo.
- Use separate volumes for `./data` and `./apps/server/data` in container deployments.
