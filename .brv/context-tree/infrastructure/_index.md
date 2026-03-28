---
children_hash: 20fd0962bfadcb754d72f7bcf6a905be6f1e958380bbee04935f3c0a20f54af2
compression_ratio: 0.24222529371112647
condensation_order: 2
covers: [context.md, myaika_architecture/_index.md, myaika_baseline/_index.md, myaika_integrations/_index.md, myaika_operating_model/_index.md, myaika_system/_index.md, testing/_index.md]
covers_token_total: 2894
summary_level: d2
token_count: 701
type: summary
---
# MyAika Infrastructure and Operational Framework Summary

The MyAika platform utilizes a containerized, split-stack architecture (Server/Mind and Web-UI/Body) managed via Docker Compose. The system is governed by an intent-based operating model and rigorous safety policies.

## System Architecture and Rollout
*   **Core Infrastructure:** Standardized on `docker-compose.aika-stack.yml` (e.g., `aika-shell`, `mcp-worker`, `web-ui`). Baseline readiness is maintained via `scripts/daily_up_verify.ps1`, which orchestrates stack lifecycle and integrity verification.
*   **Operating Model:** Execution follows an 8-step protocol (Goal → Capability Map → Plan → Tool Routing → Execution → Evidence → Risks → Next Step).
*   **Safety & Governance:** Employs a deny-by-default policy with manual approval gating for high-risk operations (e.g., system modification, secret handling). Audit logs use hash-chaining for integrity.
*   **Rollout Strategy:** Infrastructure is deployed in operational lanes with isolated trust profiles (low_trust, work_trust, high_trust). Deployment verification is centralized in `scripts/verify_rollout_completion.ps1`.

## Wizard Chess Module (Phases 17-31)
The Wizard Chess module serves as a primary integration example, demonstrating voice-first, cinematic interactions.
*   **Engine & Rendering:** UCI communication via `stockfishEngine.js` (ports 8790, 8791, 8787). UI rendering uses React (`WizardChessPanel.jsx`) and Three.js (`WizardArenaScene`) with GSAP animations.
*   **Operational Constraints:**
    *   **TTS:** Parameters are strictly gated (Rate: 0.85–1.2, Pitch: 0.85–1.35) with a 1000ms inter-utterance pause.
    *   **Cinematics:** Battle FX intensity (0.4–1.35) and animation timelines (e.g., strike at 0.22s) are precisely defined.
*   **Reference:** See `myaika_architecture/_index.md` and related phase documentation.

## Integrations and System Configuration
*   **Integrations:** Uses MCP-lite patterns to connect services (Google Drive, Telegram, Fireflies). Telegram memory is managed via thread-based SQLite storage.
*   **System Tuning:** Interaction state is controlled via `apps/server/index.js` and `memory.js`. TTS output is emotion-tuned, with default intensity 0.35 and mood-based parameter shifts applied to voice synthesis.
*   **Reference:** See `myaika_integrations/_index.md` and `myaika_system/_index.md`.

## Lifecycle and Testing
*   **Startup Baseline:** Requires Docker 28.1.1 and Compose 2.35.1. The system uses a Playwright-based action runner for UI automation.
*   **Testing:** UI Chat Approval Smoke Testing ensures deterministic approval/deny flows. Tests are executed via `npm run ui:smoke:approval` using Playwright and mocked backend endpoints.
*   **Reference:** See `myaika_baseline/_index.md` and `testing/_index.md`.