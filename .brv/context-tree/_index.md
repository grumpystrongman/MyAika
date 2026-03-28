---
children_hash: 36402334e39a44f2feccfe9fa4d8a1e386c7fcf0a7f3bbe4cf5fe82e00405ab2
compression_ratio: 0.5164319248826291
condensation_order: 3
covers: [infrastructure/_index.md, structure/_index.md]
covers_token_total: 1278
summary_level: d3
token_count: 660
type: summary
---
# Infrastructure and Structure Domain Summary

This structural summary integrates the Infrastructure (architecture, lifecycle, systems) and Structure (operator profile, web interface) domains, providing a consolidated view of the MyAika system.

### 1. System Architecture & Lifecycle (Infrastructure)
The MyAika system utilizes a Docker-first deployment strategy and an 8-step execution protocol (Goal → Capability Map → Plan → Tool Routing → Execution → Evidence → Risks → Next Step).
*   **Architecture Rollout:** Evolved through 31 phases, currently featuring the Wizard Chess engine (Phases 17-31) and a 9-cohort verification framework (Phases 15-16).
*   **Baseline Operations:** Orchestrated via `scripts/daily_up_verify.ps1`, managing environment integrity, health checks (180s timeout), and automated recovery.
*   **Safety & Governance:** Enforces a deny-by-default approval policy for high-risk actions (installs, deletions, git) and isolates execution using browser profiles (low/work/high_trust).
*   **Testing:** Validates core workflows (Approve/Deny) using Playwright-based smoke tests (`npm run ui:smoke:approval`) with a 45,000ms timeout.

### 2. Aika Operator & Web Interface (Structure)
The Aika assistant functions as a digital twin, balancing proactive execution with strict security boundaries.
*   **Operational Profile:** Operates under a "proactive ownership" model; secrets must be sourced via vault references rather than raw inclusion. Detailed behavioral constraints are documented in [Aika Operator Profile](aika_operator_profile.md).
*   **Web Interface Configuration:** Centrally managed via `apps/web/pages/index.jsx`, coordinating state through React hooks and server URL resolution (`NEXT_PUBLIC_SERVER_URL`).
*   **Interaction & TTS Constraints:**
    *   **Text-to-Speech:** Enforces 180-character segment limits via `splitSpeechText`.
    *   **Audio Tuning:** Dynamically adjusts Piper TTS parameters (Happy mode: +0.08 rate, +0.6 pitch) using the Web Audio API.
    *   **Persistence:** Preference updates are governed by a 500ms debounce interval.
    *   **Sync:** Integrates with `/api/approvals` and `/api/assistant/profile` for real-time synchronization.

### Key Drill-Down References
*   **Infrastructure:** [myaika_architecture_baseline.md](myaika_architecture_baseline.md), [aika_operating_model.md](aika_operating_model.md), [daily_stack_bring_up_script.md](daily_stack_bring_up_script.md), [ui_chat_approval_smoke_test.md](ui_chat_approval_smoke_test.md).
*   **Structure:** [Aika Operator Profile](aika_operator_profile.md), [Web Interface Configuration](web_interface_configuration.md).