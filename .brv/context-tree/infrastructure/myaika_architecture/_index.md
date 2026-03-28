---
children_hash: 2dd155080c0702b44602189ffed48d5381ee5298f66d61680708ccda958d077e
compression_ratio: 0.14151165528608428
condensation_order: 1
covers: [aika_architecture_rollout_phases_6_10.md, myaika_architecture_baseline.md, myaika_system_architecture.md, phase_17_wizard_chess/_index.md, phase_18_wizard_chess/_index.md, phase_19_20_wizard_chess/_index.md, phase_21_24_wizard_chess/_index.md, phase_25_28_wizard_chess/_index.md, phase_29_31_wizard_chess/_index.md, rollout_verification/_index.md, wizard_chess_ui_config/_index.md]
covers_token_total: 4247
summary_level: d1
token_count: 601
type: summary
---
MyAika System Architecture and Rollout Summary

The MyAika architecture follows a split-system design separating the server (mind) and web UI (body), utilizing a Docker-first deployment strategy.

Core Infrastructure and Baseline
The stack is orchestrated via docker-compose profiles (daily, test, experimental). Core components include aika-shell (API at 8787), mcp-worker, web-ui (at 3000), and agent-browser. Safety is enforced via a deny-by-default policy, requiring approval for high-risk actions (email, system, delete) with hash-chained audit logs. Rollout Phases 6-10 focused on build optimization (reducing Docker context from 3.88GB to 96KB), automated stack bring-up via daily_up_verify.ps1, and implementing mandatory service healthchecks.

Rollout Verification
Verification has transitioned to an automated framework (Phases 15-16) covering 9 cohorts, including runtime, workflow skills, protocol intent, and UI smoke tests. Key architectural decisions include the Tier-2 approval contract, which requires structured metadata (Action/Why/Tool/Boundary/Risk/Rollback) for all workflow-dispatched actions to ensure granular risk assessment and automated rollback capability.

Wizard Chess Module
The Wizard Chess module integrates a Stockfish-backed engine into the MyAika interface, evolving through Phases 17-31 from basic UCI orchestration to a cinematic, voice-first experience.

Architectural Components
- Engine: Server-side UCI orchestration via stockfishEngine.js.
- UI: React-based WizardChessPanel.jsx utilizing chess.js, chessground, and GSAP for battle animations.
- Soundscape: Oscillator-based synthesis for event-driven audio.
- Content: Manifest-driven universe packs (e.g., mythic_realms) manage board themes and army identities.

Operational Standards & Constraints
- Performance: Engine move response times are constrained to 120ms–5000ms.
- Voice Synthesis: Configured with specific rate (0.85–1.2), pitch (0.85–1.35), and volume (0.95) limits, with a mandatory 1000ms gate between utterances.
- Verification: Headless validation is managed via Playwright in ui_wizard_chess_smoke.js, with automated piece model generation (generate_wizard_piece_svgs.mjs) required for skin updates.
- Persistence: UI preferences are keyed under aika_wizard_chess_ui_v2.

Refer to individual phase entries (17-31) and the Rollout Verification Procedures for granular implementation details.