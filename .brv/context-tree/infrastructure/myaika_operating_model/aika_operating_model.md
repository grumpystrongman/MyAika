---
title: Aika Operating Model
tags: []
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-03-27T17:52:18.934Z'
updatedAt: '2026-03-27T18:01:36.358Z'
---
## Raw Concept
**Task:**
Define Aika Operating Model

**Files:**
- apps/server/src/aika/laneExecutor.js
- apps/server/src/aika/commandRouter.js
- apps/server/src/aika/intentProtocol.js
- config/aika_operating_model.json

**Flow:**
Goal -> Capability Map -> Plan -> Tool Routing -> Execution -> Evidence -> Risks -> Next Step

## Narrative
### Structure
Aika uses an 8-step execution loop and specific command grammar intents for routing tasks to specialized lanes (Code, Web, Desktop, etc.).

### Dependencies
Relies on laneExecutor, commandRouter, and intentProtocol modules.

### Highlights
Supports diverse execution modes including Mission Mode, Watchtower, and Counterfactual Engine. Strict approval policy for safety-sensitive actions.

## Facts
- **execution_loop**: Aika uses an 8-step execution loop [project]
- **approval_policy**: Approval is required for installs, deletes, overwrites, logins, secrets, publishing, git push, deploy, and container changes [project]
