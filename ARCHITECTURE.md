# Architecture

**High-Level Overview**
```
Web/Desktop UI
    |
    v
API Server (Express)
    |-- Auth (Google OAuth -> JWT)
    |-- RAG (per-user SQLite + vector index)
    |-- Storage (SQLite main DB)
    |-- Integrations (Google, Microsoft, Slack, etc)
    |
    v
Worker Loop (optional separate process)
    |
    v
Work Queue (JSON file)
```

**Core Components**
- API Server: Express app in `apps/server/index.js` with auth middleware, request context injection, and route handlers.
- Auth: Google OAuth login flow, JWT issuance, allowlist enforcement, and request context via AsyncLocalStorage.
- Storage (Main): SQLite DB for user data, approvals, modules, tasks, and conversations (`apps/server/storage`).
- RAG Storage: Per-user SQLite database with embeddings + vector index files (`apps/server/src/rag`).
- Worker: Processes queued background jobs (`apps/server/worker.js`, `apps/server/src/workers`).
- Web UI: Next.js app in `apps/web` (Chat, Recordings, Trading, Safety, Tools).

**Data Isolation**
- RAG data is per-user when `RAG_MULTIUSER_ENABLED=1`.
- Conversation history is scoped by `user_id` in `chat_threads`.
- Storage wrappers in `apps/server/src/stores` enforce context scoping.

**Deployment Notes**
- Run API and worker as separate processes for hosted environments.
- Use Docker Compose for local containerized deployments (`docker-compose.yml`).
