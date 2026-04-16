# Current-State Architecture

## Main product repo: MyAika

MyAika is a working AI companion stack with:
- `apps/server`: Express-based API server, authentication, memory, RAG, integrations, safety policy, approvals, and action orchestration.
- `apps/web`: Next.js UI for chat, recordings, trading, tools, and safety dashboards.
- `packages/shared`: shared schema and runtime types for the server and UI.
- `config/policy.json`: deny-by-default safety policy with approval gating for high-risk actions.
- `apps/server/mcp`: tool registry and executor wiring for actions and approvals.
- `apps/server/src/rag`: local RAG store with SQLite + `sqlite-vec` HNSW fallback and Fireflies ingest.
- `apps/server/src/safety`: policy loader, evaluator, redaction, and approval maintenance.
- `apps/server/src/agent`: intent routing, action pipeline, and multi-agent planning.

### Key capabilities already present
- Google integration: Drive, Calendar, Gmail.
- Messaging integration: Telegram, Slack, Discord, WhatsApp, SMS.
- Action automation: tool execution, desktop automation, workflow-style planning.
- Safety gating: approval queue, redaction, protected paths, kill switch.
- Memory and RAG: per-user RAG stores, memory writes, embeddings, search, transcript processing.
- Voice/Avatar: GPT-SoVITS and Live2D avatar support in the web UI.
- Auth: Google OAuth + JWT tokens, allowlist enforcement.
- Deployment: Docker Compose, local development scripts, health checks.

## Secondary repo: MyAikaPersonalAssistant

This repo is effectively the same companion product architecture and is a duplicate product surface. It exposes the same:
- `apps/server` API + orchestrator
- `apps/web` UI
- `packages/shared` schemas
- `config` policy and connector settings
- `scripts` for local dev, smoke tests, and memory retention

**Decision:** consolidate on the `MyAika` repository as the primary product repo. Treat `MyAikaPersonalAssistant` as a secondary source of product documentation and validation artifacts rather than a separate long-term repo.

## Safety layer repo: OpenAegis

OpenAegis is an enterprise-grade trust/policy/control platform built for:
- policy evaluation outside of the model
- approval ticketing and dual-control gating
- audit-ledger evidence generation
- workflow orchestration and tool registry
- tenant-aware mTLS and service authentication

It is not the chat UI itself, but it is the correct guardrail and enforcement subsystem for AIKA.

### OpenAegis core strengths
- external policy evaluation via `/v1/policy/evaluate`
- approval creation via `/v1/approvals`
- model routing and tool execution governance
- audit/evidence ledger and kill-switch APIs
- commercial trust proof artifacts and sandbox proofs

## Summary of current state

- MyAika already contains a robust companion stack with safety, memory, and integrations.
- MyAikaPersonalAssistant is redundant and should be merged into MyAika.
- OpenAegis provides the enterprise-grade policy and approval platform that should be integrated as the security layer.
- The existing MyAika codebase already satisfies several requirements for an orchestrator, memory system, and approval gating.
