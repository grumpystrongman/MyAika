---
children_hash: e066662257a0e64cfa990380cd5017d57635c92190cbd6ca7cbcfa94c3b1986a
compression_ratio: 0.13824175824175824
condensation_order: 1
covers: [aika_architecture_rollout_phases_6_10.md, myaika_architecture_baseline.md, myaika_system_architecture.md, phase_17_wizard_chess/_index.md, phase_18_wizard_chess/_index.md, phase_19_20_wizard_chess/_index.md, phase_21_24_wizard_chess/_index.md, phase_25_28_wizard_chess/_index.md, phase_29_31_wizard_chess/_index.md, rollout_verification/_index.md, wizard_chess_ui_config/_index.md]
covers_token_total: 4550
summary_level: d1
token_count: 629
type: summary
---
# AIKA Architecture and Wizard Chess Rollout Summary

The AIKA system architecture is a Docker-based, split-stack platform consisting of a server-side "mind" (API, 8787/8790) and a web-based "body" (UI, 3000/3105). System integrity is maintained via a deny-by-default safety policy and an automated verification framework.

## System Architecture and Rollout Baseline
*   **Infrastructure:** Orchestrated via `docker-compose.aika-stack.yml` with profiles (daily, test, experimental). Build contexts are optimized using `.dockerignore` and verified via `scripts/verify_core_stack.ps1`.
*   **Safety & Policy:** High-risk actions are approval-gated. Audit logs are hash-chained.
*   **Rollout Verification:** Phases 15-16 established a rigorous cohort verification pipeline (`npm run verify:rollout`). Phase 16 introduced a strict Tier-2 approval contract for skill-first workflow dispatch (documented in `apps/server/mcp/approvals.js`).
*   **Reference:** See `myaika_system_architecture.md`, `myaika_architecture_baseline.md`, and `rollout_verification/_index.md`.

## Wizard Chess Implementation (Phases 17-31)
The Wizard Chess module integrates a Stockfish-backed engine with a cinematic UI, evolving from basic move validation to a fully featured, voice-first, theme-driven arena.

*   **Core Components:** 
    *   **Logic:** Server-side UCI orchestration (`stockfishEngine.js`), `chess.js` state management, and Playwright-based smoke testing.
    *   **UI/Rendering:** React-based `WizardChessPanel.jsx` and Three.js/GSAP battle scene rendering.
    *   **Content:** Manifest-driven universe packs (themes, armies, encounters) managed by `themes.js` and `encounters.js`.
*   **Cinematics & Voice:** Battle sequences use synchronized GSAP animations (pulse/duel FX). Voice interactions use Web Speech API (zira, aria, etc.) with specific pacing controls (1000ms utterance gate).
*   **Configuration:** Preferences are persisted under `aika_wizard_chess_ui_v2`. Mandatory engine communication occurs via `POST /api/chess/engine-move`.
*   **Drill-Down:** 
    *   Phases 17-20: Engine setup, soundscape, and encounter registry.
    *   Phases 21-24: Cinematic polish and ResizeObserver-based UI synchronization.
    *   Phases 25-28: AI clock parity and visual fidelity/movement trails.
    *   Phases 29-31: Automated SVG generation pipeline and runtime error recovery.
    *   Reference: See domain `infrastructure/myaika_architecture/` for individual phase documentation and `wizard_chess_ui_config/_index.md`.