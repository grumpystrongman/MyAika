---
children_hash: 3f0dce1c1ffe76b4c39e8be71a77d4999cb66d7481eb43cc77658da17f92a21f
compression_ratio: 0.4759825327510917
condensation_order: 3
covers: [infrastructure/_index.md, structure/_index.md]
covers_token_total: 1374
summary_level: d3
token_count: 654
type: summary
---
# Structural Overview: MyAika Infrastructure and Operational Framework

This summary integrates the architectural, operational, and structural components of the MyAika platform at the system (Infrastructure) and interface (Structure) levels.

## Infrastructure and System Architecture
The MyAika platform utilizes a split-architecture model, isolating the server-side "mind" (API, RAG, orchestration) from the web-based "body" (React UI). 

*   **Deployment and Control:** Orchestrated via `docker-compose.aika-stack.yml` with profiles (e.g., `daily`, `test`). The MCP-lite control plane manages a 38-module registry, with execution governed by the 8-step protocol (Goal → Capability Map → Plan → Tool Routing → Execution → Evidence → Risks → Next Step).
*   **Wizard Chess Module (Phases 17-31):** Personality-driven engine using server-side UCI orchestration (`apps/server/src/chess/stockfishEngine.js`), featuring visual integration via Three.js/GSAP.
*   **Safety and Governance:** Deny-by-default execution policy with mandatory approval for high-risk actions. Audit logs are hash-chained, and environments are isolated via specific browser trust profiles.
*   **Verification:** Rollout and system health are validated through `scripts/verify_rollout_completion.ps1`. UI interactions are deterministicly tested using Playwright-based smoke tests (`ui_chat_approval_smoke_test.md`).

For deep dives into architectural baselines, rollout phases, and system startup, refer to `myaika_architecture/_index.md` and `myaika_baseline/_index.md`.

## Aika Operator and Frontend Interface
The structural layer defines the Aika digital twin's operational persona and the technical implementation of the web interface.

*   **Operator Profile:** Functions as a strategic partner under a "proactive ownership" model. Operates with strict security boundaries, requiring vault references instead of raw secrets and explicit user confirmation for high-risk operations. Detailed behavioral structures are documented in `aika_operator_profile.md`.
*   **Web Interface Configuration:** Centered in `apps/web/pages/index.jsx`, the interface manages state synchronization and real-time polling for approval updates.
    *   **Processing Constraints:** Implements `splitSpeechText` (180-char limit) and a 500ms debounce for preference persistence.
    *   **Audio/TTS:** Employs Web Audio API modifiers for emotion-based tuning (e.g., pitch/rate adjustments).
    *   **API Integration:** Synchronizes via `/api/approvals` and `/api/assistant/profile`.

For specific implementation details, refer to `web_interface_configuration.md`.