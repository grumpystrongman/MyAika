---
children_hash: d197f3dbe9ee7274c4fbaaa82d2dfb5e08779c06d0766d92fc8e1951540766f8
compression_ratio: 0.21859649122807018
condensation_order: 2
covers: [context.md, myaika_architecture/_index.md, myaika_baseline/_index.md, myaika_integrations/_index.md, myaika_operating_model/_index.md, myaika_system/_index.md, testing/_index.md]
covers_token_total: 2850
summary_level: d2
token_count: 623
type: summary
---
# Infrastructure Domain Summary

The Infrastructure domain governs the MyAika architecture, operational lifecycle, and governance frameworks.

## MyAika Architecture and Rollout
- **System Baseline**: A containerized split architecture (API: port 8787, Web UI: port 3000) managed by `docker-compose.aika-stack.yml`. Core components include `aika-shell`, `mcp-worker`, and `agent-browser`.
- **Wizard Chess Rollout (Phases 17-31)**: An evolution from basic UCI engine integration to a cinematic, voice-first combat arena. Key implementations include a Three.js/GSAP rendering engine, Web Speech API integration, and an automated SVG pipeline (`generate_wizard_piece_svgs.mjs`).
- **Rollout Verification**: Centralized gatekeeping via `scripts/verify_rollout_completion.ps1`, enforcing Tier-2 payload structures and strict compliance gates for all deployments.
- **Drill-down**: See `myaika_architecture/_index.md`.

## Lifecycle and System Configuration
- **Environment Baseline**: Requires Docker 28.1.1 and Docker Compose 2.35.1. The environment is managed by `scripts/daily_up_verify.ps1`, which orchestrates service bring-up with a 180s timeout and integrity verification.
- **Operating Model**: Follows an 8-step execution protocol (Goal → Tool Routing → Evidence → Next Step) with an MCP-lite control plane. Safety is enforced via deny-by-default policies and manual approval gating for high-risk actions.
- **System Tuning**: TTS engine (Piper) adapts parameters like rate and pitch based on detected system moods (default intensity 0.35).
- **Drill-down**: See `myaika_baseline/_index.md`, `myaika_operating_model/_index.md`, and `myaika_system/_index.md`.

## Integrations and Testing
- **Integrations**: Extensible via MCP-lite patterns (`apps/server/integrations`). Supports Google OAuth, Fireflies, Telegram, and Amazon Research. Persistence for Telegram threads is managed via SQLite.
- **Testing Framework**: Deterministic validation of chat-based approval workflows using Playwright. Smoke tests simulate user-driven interactions against mocked endpoints (`/chat`, `/api/approvals`).
- **Drill-down**: See `myaika_integrations/_index.md` and `testing/_index.md`.

## Governance and Security
- **Trust Boundaries**: Execution environments are isolated using separated browser profiles (low_trust, work_trust, high_trust).
- **Approval Logic**: High-risk actions (email, system delete, git operations) require manual approval contracts, ensuring audit trails via hash-chained logs.