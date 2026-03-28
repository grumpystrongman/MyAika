---
children_hash: 06ea08d295b9f41298dde0482c4a5fd2cd6228a2d7ef9e4f7627723cf9ab5b68
compression_ratio: 0.6056661562021439
condensation_order: 3
covers: [infrastructure/_index.md, structure/_index.md]
covers_token_total: 1306
summary_level: d3
token_count: 791
type: summary
---
# Structural Summary: MyAika Infrastructure and Operational Framework (Level d3)

This synthesis consolidates the infrastructure, operational model, and frontend architecture of the MyAika platform.

## Infrastructure and Operational Framework
The MyAika platform employs a containerized, split-stack architecture (Server/Mind and Web-UI/Body) managed via Docker Compose. The system is governed by a rigorous intent-based operating model and deny-by-default safety policies.

### System Architecture and Rollout
* Core Infrastructure: Standardized on `docker-compose.aika-stack.yml`. Readiness is verified via `scripts/daily_up_verify.ps1`.
* Operating Model: Follows an 8-step execution protocol (Goal → Capability Map → Plan → Tool Routing → Execution → Evidence → Risks → Next Step).
* Rollout Strategy: Deployment occurs in operational lanes (low_trust, work_trust, high_trust) with centralized verification via `scripts/verify_rollout_completion.ps1`.
* Governance: High-risk operations require manual approval gating; audit logs utilize hash-chaining for integrity.
* See: `infrastructure/myaika_architecture/_index.md`

### Wizard Chess Module (Phases 17-31)
Functions as the primary integration example for voice-first, cinematic interaction.
* Engine/Rendering: UCI communication via `stockfishEngine.js` (ports 8790, 8791, 8787). UI utilizes React (`WizardChessPanel.jsx`) and Three.js (`WizardArenaScene`).
* Constraints: TTS parameters (Rate 0.85-1.2, Pitch 0.85-1.35) and battle FX are precisely modeled.
* See: `infrastructure/myaika_architecture/phase_17_wizard_chess/` through `phase_29_31_wizard_chess/`

### System Integrations and Testing
* Integrations: Utilizes MCP-lite patterns for services (Google Drive, Telegram, Fireflies). Telegram thread memory is managed via SQLite.
* Testing: Playwright-based suites (e.g., `npm run ui:smoke:approval`) ensure deterministic approval flows and system baseline integrity.
* See: `infrastructure/myaika_integrations/_index.md` and `infrastructure/testing/_index.md`

## Operator and Frontend Interface
This layer defines the behavioral and technical interface for user interaction.

### Aika Operator Profile
* Behavioral Framework: Operates on a "proactive ownership" model, balancing concise, strategic communication with strict security boundaries (mandatory vault references, no raw secrets).
* Approval Logic: Requires explicit user confirmation for irreversible or high-risk actions.
* See: `structure/aika_operator/aika_operator_profile.md`

### Frontend Web Interface
* Architecture: Central hub for interaction logic, managed in `apps/web/pages/index.jsx`.
* State Management: Real-time synchronization is achieved through React hooks with dedicated approval polling.
* Processing Constraints:
    * TTS: Enforces 180-character segments via `splitSpeechText`.
    * Persistence: Preference updates utilize a 500ms debounce interval.
    * Audio: Web Audio API integration with emotion-specific modifiers (e.g., "Happy" mode modifiers).
* API Integration: Synchronizes via `/api/approvals` and `/api/assistant/profile`.
* See: `structure/frontend/web_interface/web_interface_configuration.md`