---
children_hash: 38cb1c5db5d4ab9620230c06a1fb2c382dad077546f32ceb228ebcd29b792980
compression_ratio: 0.48859934853420195
condensation_order: 3
covers: [infrastructure/_index.md, structure/_index.md]
covers_token_total: 1228
summary_level: d3
token_count: 600
type: summary
---
# Structural Summary: MyAika Infrastructure and Operational Framework

This summary provides a level d3 structural overview of the MyAika platform, integrating foundational infrastructure governance with operator-specific behavioral and interface configurations.

## Infrastructure Domain (Drill-down: infrastructure/_index.md)
The infrastructure domain comprises the system's foundational architecture, operational lifecycle, and quality assurance protocols.

*   **System Architecture:** Utilizes a split-stack Docker framework (Server API: 8787/8790; Web Body: 3000/3105). Key developments include the voice-first Wizard Chess module (Phases 17-31) and automated rollout verification via `npm run verify:rollout`.
*   **Operational Baseline:** Orchestrated by `scripts/daily_up_verify.ps1`, which manages Docker compose profiles and system readiness checks. Execution follows an 8-step `laneExecutor` loop gated by a manual authorization policy for high-risk operations.
*   **Integrations & TTS:** Extensibility relies on MCP-lite patterns (`apps/server/integrations`). TTS processing uses Piper with emotion-tuned parameters (intensity default 0.35).
*   **Quality Assurance:** Employs deterministic Playwright-based smoke testing for chat-based approval workflows (`npm run ui:smoke:approval`).

## Structural/Operational Domain (Drill-down: structure/_index.md)
This domain defines the Aika operator's behavioral profile and the technical configuration of the web interface.

*   **Aika Operator Profile:** Operates under a "proactive ownership" model with strict security boundaries, requiring explicit confirmation for high-risk actions. Behavioral expectations and preferences are documented in [Aika Operator Profile](aika_operator_profile.md).
*   **Frontend Interface:** Centered on `apps/web/pages/index.jsx`, the interface manages state synchronization via React hooks with polling for approval updates.
    *   **Processing Constraints:** Enforces a 180-character limit per TTS segment and utilizes a 500ms debounce interval for preference updates.
    *   **Audio Tuning:** The Web Audio API applies emotion-specific modifiers (e.g., "Happy" mode: +0.08 rate, +0.6 pitch).
    *   **API Integration:** Facilitates synchronization through `/api/approvals` and `/api/assistant/profile`. Refer to [Web Interface Configuration](web_interface_configuration.md) for implementation details.