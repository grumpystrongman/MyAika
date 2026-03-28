---
children_hash: 9278a0f7bd107deef636ba2107830d9c31e8cfd67908b7dc164104ccb0073a60
compression_ratio: 0.24696802646085997
condensation_order: 2
covers: [context.md, myaika_architecture/_index.md, myaika_baseline/_index.md, myaika_integrations/_index.md, myaika_operating_model/_index.md, myaika_system/_index.md, testing/_index.md]
covers_token_total: 2721
summary_level: d2
token_count: 672
type: summary
---
# Infrastructure Domain Structural Summary

The Infrastructure domain encompasses the MyAika architecture, operational models, and lifecycle automation. It is structured into five primary functional areas:

### 1. System Architecture & Rollout (myaika_architecture)
The system employs a split-design (Server/UI) using a Docker-first deployment strategy. 
*   **Rollout Phases:** Architecture has evolved through 31 phases, moving from baseline infrastructure to advanced modules like Wizard Chess.
*   **Wizard Chess Module:** A voice-first, cinematic engine (Phases 17-31) integrating Stockfish via `stockfishEngine.js`, React-based UI, and oscillator-based audio synthesis.
*   **Verification:** Transitioned to an automated 9-cohort framework (Phases 15-16) enforcing Tier-2 approval contracts and granular risk assessment.

### 2. Operating Model (myaika_operating_model)
Defines governance for execution and safety.
*   **Execution Protocol:** An 8-step cycle (Goal → Capability Map → Plan → Tool Routing → Execution → Evidence → Risks → Next Step).
*   **Approval Policy:** Enforces a deny-by-default stance for high-risk actions (installs, deletions, git, secrets).
*   **Trust Boundaries:** Isolates execution via browser profiles (low/work/high_trust) and Docker-based service lanes.

### 3. Startup & Lifecycle Baseline (myaika_baseline)
Manages the environment and stack orchestration.
*   **Orchestration:** Orchestrated via `scripts/daily_up_verify.ps1`, using Docker 28.1.1 and Compose 2.35.1.
*   **Lifecycle:** Automates stack bring-up, service health checks (180s timeout), and system integrity verification.
*   **Recovery:** Includes automated retry logic and explicit rollback guidance (`compose down`).

### 4. Integrations & Systems (myaika_integrations & myaika_system)
*   **Integrations:** Uses an MCP-lite pattern for extensibility (Google Suite, Fireflies, Telegram). Authentication is managed via OAuth, with SQLite-based memory for thread-specific data.
*   **System Configuration:** Controls interaction state and TTS engine (Piper). Piper is tuned dynamically based on system mood (e.g., Happy mood adjusts rate/pitch), with default intensity at 0.35.

### 5. Testing Framework (testing)
*   **UI Chat Approval Smoke Test:** Validates "approve-execute" and "deny" flows using Playwright.
*   **Execution:** Runs via `npm run ui:smoke:approval`, relying on mocked backend endpoints to isolate frontend logic within a configurable 45,000ms timeout.

For granular technical specifications, refer to individual component files: `myaika_architecture_baseline.md`, `aika_operating_model.md`, `daily_stack_bring_up_script.md`, and `ui_chat_approval_smoke_test.md`.