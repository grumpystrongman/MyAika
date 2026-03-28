---
children_hash: d47ab57044c1b9ade9cfcc3215d19f6eda68157145f3ea18dc6abe134478d20d
compression_ratio: 0.5581773799837266
condensation_order: 3
covers: [infrastructure/_index.md, structure/_index.md]
covers_token_total: 1229
summary_level: d3
token_count: 686
type: summary
---
# Structural Overview: Infrastructure and System Architecture

This summary provides a consolidated view of the MyAika ecosystem, encompassing core infrastructure, operational governance, and structural interface configurations.

## Infrastructure Domain (See infrastructure/_index.md)
The Infrastructure domain serves as the central control plane for system deployment, lifecycle management, and security.

*   **Architecture & Rollout**: MyAika utilizes a containerized split-service architecture (API: 8787, Web: 3000) managed via `docker-compose.aika-stack.yml`. The "Wizard Chess" rollout (Phases 17-31) represents a significant evolution, integrating a Three.js/GSAP rendering engine and automated SVG pipelines (`generate_wizard_piece_svgs.mjs`) for voice-first combat environments.
*   **Operating Model**: Operations are governed by an 8-step execution protocol (Goal → Tool Routing → Evidence → Next Step). Security is maintained through a deny-by-default policy, isolated browser profiles (low/work/high trust), and manual approval contracts for high-risk operations (email, deletions, git).
*   **System Baseline**: Environment integrity is verified via `scripts/daily_up_verify.ps1`, which enforces strict service bring-up timeouts (180s). TTS engine parameters (Piper) are dynamically tuned based on detected system moods.
*   **Testing & Integration**: Deterministic validation is managed via Playwright smoke tests for chat-based approval workflows. Integrations (Google OAuth, Fireflies, Telegram) follow MCP-lite patterns, with Telegram threads persisted in SQLite.

## Structural Interface (See structure/_index.md)
The Structural domain defines the interaction model between the Aika Operator and the web interface.

*   **Aika Operator Profile**: Operates as a strategic digital twin, balancing proactive ownership with strict adherence to security boundaries. Decision-making is aligned with user behavioral patterns, with preferences and skills managed per the [Aika Operator Profile](aika_operator_profile.md).
*   **Frontend Web Interface**: Centralizes interaction logic in `apps/web/pages/index.jsx`.
    *   **State Management**: Resolves server URLs via `NEXT_PUBLIC_SERVER_URL` and uses React hooks for real-time synchronization with approval endpoints.
    *   **Processing Constraints**: Enforces 180-character segment limits on TTS via `splitSpeechText` and utilizes a 500ms debounce interval for persistence updates.
    *   **Audio Tuning**: Employs Web Audio API modifiers to adjust rate/pitch based on emotion-specific modes (e.g., "Happy" applies +0.08 rate, +0.6 pitch).
    *   **Drill-down**: Refers to [Web Interface Configuration](web_interface_configuration.md) for technical implementation specifics.