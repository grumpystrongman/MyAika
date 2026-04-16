# Target Unified Architecture

## Primary repo
- `MyAika` becomes the primary product repo and the single source of truth for AIKA runtime, UI, and memory.
- `MyAikaPersonalAssistant` is folded into `MyAika` as a secondary reference and retention artifact.
- `OpenAegis` becomes the policy, approval, and security enforcement subsystem.

## Architecture overview

```
User Interface (Web + Voice)
      |
      v
AIKA Orchestrator Core (MyAika)
      |- Agent Swarm
      |- Memory System
      |- Tool Registry
      |- Policy Adapter
      |- Action Executor
      |
      v
OpenAegis Trust Plane (external / optional)
      |- Policy Evaluation API
      |- Approval Service
      |- Audit / Evidence Ledger
      |- Kill Switch Service
      |- Tool Execution Service
      |- Model Broker
```

## Core components

### Orchestrator Core
- central task router for incoming user intents
- agent contract enforcement
- policy gate and risk scoring
- audit event dispatch
- tool execution orchestration
- memory read/write coordination

### Agent Swarm
- Companion Agent: warm conversational context, presence, callback memory
- Executive Agent: task triage, prioritization, decision support
- Research Agent: synthesis, uncertainty labeling, citation
- Novel Editor Agent: story structure, editing, continuity checks
- Coaching Agent: reflection, motivation, accountability
- Repo Engineer Agent: code/pr task automation, branch sketching
- Memory Curator Agent: summary writing, correction, retention
- Security Guardian Agent: gating, veto, safety prompt enforcement
- Computer Action Agent: bounded local actions, preview-before-run
- Planning Agent: project roadmaps, checklists, execution plans

### Memory System
- short-term conversational memory
- long-term semantic memory
- profile/preferences memory
- project memory
- relationship memory
- writing/story memory

Memory storage is hybrid:
- structured SQLite tables
- vector embeddings for semantic search
- recency and relevance scoring
- source attribution
- user-editable and deletable entries

### Security Layer
- local safety config plus OpenAegis external policy adapter
- protected paths and network rules
- approval workflow for high-risk actions
- kill switch and audit logging
- explicit human approval gating for destructive operations

### Tool / System Integration
- GitHub / repo operations
- Google Drive / Docs / Sheets / Calendar
- Gmail / inbox triage
- Notion / notes
- Linear / task planning
- Messaging and notification channels

### Personality Engine
- built around a defined tone profile
- responsive, humanlike but not deceptive
- warm, intelligent, slightly witty, calm
- callback memory, subtle humor, adaptive tone
- never claims to be human

## Key deliverables
- `docs/architecture/current-state.md`
- `docs/architecture/target-state.md`
- `docs/architecture/repo-convergence.md`
- `docs/architecture/security-policies.md`
- `docs/architecture/agent-contracts.md`
- `config/aika_personality.yaml`
- `docs/companion_system_prompt.md`
- `apps/server/src/core/` integration layer
- `apps/server/src/core/openAegisAdapter.js`
- `apps/server/src/core/agentContracts.js`
- `apps/server/src/core/orchestrator.js`
- `apps/server/src/core/memorySchema.js`
