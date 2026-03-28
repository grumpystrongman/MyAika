---
title: MyAika Architecture Baseline
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T15:08:43.443Z'
updatedAt: '2026-03-27T15:08:43.443Z'
---
## Raw Concept
**Task:**
Document MyAika architecture, Docker stack, and trust policies

**Changes:**
- Documented docker-compose profiles
- Documented trust boundaries
- Documented RAG pipeline sync

**Files:**
- docker-compose.aika-stack.yml
- scripts/verify_core_stack.ps1
- docs/OPERATIONS_ROLLOUT.md
- docs/TRUST_BOUNDARY_MODES.md

**Flow:**
Startup -> Orchestration -> Tool Execution -> Verification

**Timestamp:** 2026-03-27

## Narrative
### Structure
MyAika stack consists of aika-shell (API), mcp-worker, web-ui, and agent-browser. Orchestration via docker-compose profiles (daily, test, experimental).

### Dependencies
Requires node, docker, and PowerShell for verification scripts.

### Highlights
Trust boundaries defined for WORK, ELEVATED, and MAINTENANCE modes. RAG pipeline uses npm run durham:sync.

### Rules
Verification scripts must be run via npm run verify:core or powershell.
All elevated tasks require a rollback plan.

## Facts
- **port_aika_shell**: aika-shell runs on port 8787 [project]
- **port_web_ui**: web-ui runs on port 3000 [project]
- **compose_profiles**: docker-compose profiles are daily, test, experimental [project]
