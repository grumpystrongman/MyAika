---
title: Operations Rollout
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T18:48:16.995Z'
updatedAt: '2026-03-27T18:48:16.995Z'
---
## Raw Concept
**Task:**
Operationalize Docker-first layout with trust boundaries

**Files:**
- docker-compose.aika-stack.yml
- docs/OPERATIONS_ROLLOUT.md

**Timestamp:** 2026-03-27

## Narrative
### Structure
Runbook for Docker-first MyAika deployment.

### Highlights
Operationalizes service lanes (shell, worker, web, browser, skyvern, opik) with separated browser trust profiles (low, work, high).

### Rules
1. Browser profiles are separated by trust level: low_trust, work_trust, high_trust.
2. External writes are approval-gated via MCP-lite.
3. Skyvern and Opik lanes require environment-specific config.
