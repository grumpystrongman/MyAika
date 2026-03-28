---
children_hash: df45a7ab3ebc9f92c54d8267b8a53a2e159ee7604367fabd7d1518528ee625b1
compression_ratio: 0.27856365614798695
condensation_order: 2
covers: [context.md, myaika_architecture/_index.md, myaika_baseline/_index.md, myaika_integrations/_index.md, myaika_operating_model/_index.md, myaika_system/_index.md, testing/_index.md]
covers_token_total: 2757
summary_level: d2
token_count: 768
type: summary
---
# MyAika Infrastructure: Architectural and Operational Summary

The MyAika platform is a split-architecture system separating the server-side "mind" (API, RAG, orchestration) from the web-based "body" (React UI, renderer). The system is governed by a Docker-first deployment strategy and an 8-step execution protocol.

## Core Architecture & Infrastructure
- **System Model:** Orchestrated via `docker-compose.aika-stack.yml` with profiles (e.g., `daily`, `test`).
- **Control Plane:** Utilizes an MCP-lite control plane managing a 38-module registry.
- **Wizard Chess Module (Phases 17-31):** A personality-driven, Stockfish-backed engine integrated with a Three.js/GSAP visual arena. Communication uses server-side UCI orchestration (`apps/server/src/chess/stockfishEngine.js`) with move response caps between 120ms and 5000ms.
- **Build & Isolation:** Docker builds are optimized via `.dockerignore`. Windows/OneDrive environments utilize per-instance `NEXT_DIST_DIR` (e.g., `.next-wizard-<port>`) to prevent cache corruption.

## Operating Model & Governance
- **Execution Protocol:** Managed by `laneExecutor`, `commandRouter`, and `intentProtocol` (`apps/server/src/aika/`). Follows an 8-step cycle: Goal → Capability Map → Plan → Tool Routing → Execution → Evidence → Risks → Next Step.
- **Safety Policy:** Deny-by-default stance with manual approval required for high-risk actions (e.g., email, system deletions, git). Audit logs are hash-chained.
- **Trust Boundaries:** Execution environments are isolated using specific browser trust profiles (low, work, high_trust).

## Lifecycle & Automation
- **Startup:** Orchestrated via `scripts/daily_up_verify.ps1`, which manages service readiness (180s timeout) and triggers `verify_core_stack.ps1`.
- **Integrations:** MCP-lite pattern used for service extensibility (Google suite, Fireflies, Telegram, Amazon Research). Authentication relies on OAuth, with Telegram memory managed via SQLite.
- **System Tuning:** `apps/server/index.js` and `memory.js` handle UI/TTS state. Default emotion intensity is 0.35, with mood-based adjustments to TTS rate and pitch.

## Testing & Verification
- **Rollout Verification:** Centralized via `scripts/verify_rollout_completion.ps1`, validating runtime health, command grammar, and UI smoke tests.
- **UI Smoke Testing:** Deterministic validation of chat-based approval workflows using Playwright to simulate interactions against mocked endpoints (`scripts/ui_chat_approval_smoke.js`).

## Drill-Down References
- **Architecture:** `myaika_architecture_baseline.md`, `myaika_system_architecture.md`, `aika_architecture_rollout_phases_6_10.md`
- **Wizard Chess Phases:** `phase_17_wizard_chess`, `phase_18_wizard_chess`, `phase_19_20_wizard_chess`, `phase_21_24_wizard_chess`, `phase_25_28_wizard_chess`, `phase_29_31_wizard_chess`, `wizard_chess_ui_configuration.md`
- **Baseline:** `myaika_startup_baseline.md`, `daily_stack_bring_up_script.md`
- **Operations:** `aika_operating_model.md`, `operations_rollout.md`, `context.md`
- **Testing:** `ui_chat_approval_smoke_test.md`