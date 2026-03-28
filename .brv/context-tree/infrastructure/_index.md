---
children_hash: 02fef1c5e9cc270a689796362b356a1cfce52544d7a59faf440c8e9acc355ac5
compression_ratio: 0.22662786467806476
condensation_order: 2
covers: [context.md, myaika_architecture/_index.md, myaika_baseline/_index.md, myaika_integrations/_index.md, myaika_operating_model/_index.md, myaika_system/_index.md, testing/_index.md]
covers_token_total: 2749
summary_level: d2
token_count: 623
type: summary
---
# Infrastructure Domain Summary

The infrastructure domain serves as the foundational framework for the MyAika platform, encompassing system architecture, operational governance, and environment lifecycle management.

## System Architecture and Rollout
The platform utilizes a split-stack Docker architecture consisting of a server-side mind (API ports 8787/8790) and a web-based body (UI ports 3000/3105). 
* Wizard Chess Module: Phases 17-31 implemented a voice-first, cinematic arena utilizing Stockfish for logic, React/Three.js for rendering, and Playwright for smoke testing.
* Rollout Verification: Managed via `npm run verify:rollout`, utilizing a Tier-2 approval contract for skill-first workflow dispatch.
* Drill-down: Refer to myaika_architecture/_index.md.

## Operational Baseline and Execution Model
Operations are governed by a Docker-first deployment strategy targeting a 38-module registry.
* Lifecycle Automation: Orchestrated by `scripts/daily_up_verify.ps1`, which manages Docker compose profiles, service readiness (180s timeout), and system integrity checks.
* Execution Protocol: Tasks follow an 8-step execution loop (Goal to Next Step) managed by `laneExecutor` and `commandRouter`. High-risk actions (installs, deletions, git ops) are gated by an approval policy requiring manual authorization.
* Trust Boundaries: Execution lanes (e.g., Skyvern, Opik) are isolated via browser trust profiles (low/work/high_trust).
* Drill-down: Refer to myaika_baseline/_index.md and myaika_operating_model/_index.md.

## System Integration and Configuration
Extensibility is achieved through MCP-lite patterns located in `apps/server/integrations`.
* Integrations: Supports Google Docs/Drive, Fireflies, Telegram, and Amazon Research. Telegram integration utilizes SQLite for thread-based memory.
* System State: Core interactions and UI preferences are managed via `apps/server/index.js` and `apps/server/memory.js`.
* TTS Engine: Uses Piper TTS with emotion-tuned parameters (intensity 0.35 default) to adjust rate, pitch, and energy.
* Drill-down: Refer to myaika_integrations/_index.md and myaika_system/_index.md.

## Quality Assurance
The platform employs deterministic validation for chat-based approval workflows.
* UI Smoke Testing: Playwright-based framework simulates user interactions and mocks backend endpoints (`/chat`, `/api/approvals`) to isolate frontend logic.
* Execution: Triggered via `npm run ui:smoke:approval`.
* Drill-down: Refer to testing/_index.md.