---
title: MyAika System Architecture
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T15:31:24.679Z'
updatedAt: '2026-03-27T15:31:24.679Z'
---
## Raw Concept
**Task:**
Document MyAika system architecture and components

**Changes:**
- Documented core components, Docker stack, and safety policies.

**Files:**
- apps/server
- apps/web
- config/policy.json
- docker-compose.aika-stack.yml

**Flow:**
mind (server) -> body (UI/renderer); safety-gated execution via guardrails.

**Timestamp:** 2026-03-27

## Narrative
### Structure
MyAika uses a split architecture between the server (mind) and web UI (body). Data is handled via SQLite, vector indices, and local artifacts.

### Dependencies
Requires Docker for stack deployment; safety policy uses a deny-by-default approach.

### Highlights
Docker-first rollout, multi-user RAG isolation, integrated meeting copilot, and robust safety/audit guardrails.

### Rules
1. All high-risk actions (email, delete, system) are approval-gated.
2. Safety policy is deny-by-default.
3. Audit logs are hash-chained and verifiable.

## Facts
- **architecture**: MyAika splits functionality into a mind (server) and body (UI/renderer). [project]
- **config**: API host port defaults to 8790, mapped to container 8787. [project]
- **safety**: Safety policy enforcement is deny-by-default. [project]
- **retention**: Meeting recordings have a default retention of 30 days. [project]
