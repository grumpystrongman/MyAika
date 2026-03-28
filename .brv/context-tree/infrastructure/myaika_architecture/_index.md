---
children_hash: 58cb4085b40e78ff0becaf26bceb090367c6dcd90f0cc8ab6c78abfc8a17e085
compression_ratio: 0.14408504863153132
condensation_order: 1
covers: [aika_architecture_rollout_phases_6_10.md, myaika_architecture_baseline.md, myaika_system_architecture.md, phase_17_wizard_chess/_index.md, phase_18_wizard_chess/_index.md, phase_19_20_wizard_chess/_index.md, phase_21_24_wizard_chess/_index.md, phase_25_28_wizard_chess/_index.md, phase_29_31_wizard_chess/_index.md, rollout_verification/_index.md, wizard_chess_ui_config/_index.md]
covers_token_total: 4421
summary_level: d1
token_count: 637
type: summary
---
# MyAika Architectural and Wizard Chess Rollout Summary

The MyAika system employs a split-architecture model, separating the server-side "mind" (API, RAG pipeline, orchestration) from the web-based "body" (React UI, renderer). The system utilizes a Docker-first rollout strategy with automated verification pipelines and strict safety guardrails.

## Core System Architecture
*   **Infrastructure:** Orchestrated via `docker-compose.aika-stack.yml` using profiles like `daily`, `test`, and `experimental`.
*   **Safety & Policy:** Deny-by-default safety policy with approval-gated high-risk actions (email, system deletions). Audit logs are hash-chained.
*   **Verification:** Centralized testing via `scripts/verify_rollout_completion.ps1`, which validates runtime health, command grammar, and UI smoke tests.
*   **Build Optimization:** Docker build context minimized via `.dockerignore` (e.g., 3.88GB to 96KB).

## Wizard Chess Module (Phases 17-31)
The Wizard Chess module is a personality-driven, Stockfish-backed engine integrated with a Three.js/GSAP visual arena.

*   **UI & Rendering:** Features board/army themes (e.g., Obsidian, Ember, Mythic Realms) managed by a manifest-driven system. Animations use GSAP with strict timing constraints (e.g., attacker strike 0.22s, defender recoil 0.26s).
*   **Voice Integration:** Voice-first interaction utilizing Web Speech API with specific pacing (e.g., 1000ms gate between utterances) and synthesized rate/pitch controls.
*   **Engine Handling:** Server-side UCI orchestration via `apps/server/src/chess/stockfishEngine.js`. Move response times are capped between 120ms and 5000ms.
*   **Environment Isolation:** To prevent cache corruption in Windows/OneDrive environments, builds are isolated using per-instance `NEXT_DIST_DIR` (e.g., `.next-wizard-<port>`).

## Rollout Documentation & Drill-Down
*   **Architecture Baseline:** `myaika_architecture_baseline.md`, `myaika_system_architecture.md`, `aika_architecture_rollout_phases_6_10.md`
*   **Rollout Phases:**
    *   **17-18:** Initial engine integration and cinematic overhaul (`phase_17_wizard_chess`, `phase_18_wizard_chess`).
    *   **19-24:** Soundscape, encounters, and UI responsiveness (`phase_19_20_wizard_chess`, `phase_21_24_wizard_chess`).
    *   **25-31:** Final polish, battle FX pipeline, and automated SVG generation (`phase_25_28_wizard_chess`, `phase_29_31_wizard_chess`).
*   **Procedures:** `rollout_verification/_index.md` (for cohort testing) and `wizard_chess_ui_config/_index.md` (for build isolation logic).