---
children_hash: ea105e332030bcb0643301da33db4e500aeb984bf2cbc89acb0749f2a782bfbe
compression_ratio: 0.9561643835616438
condensation_order: 0
covers: [phase_17_wizard_chess.md]
covers_token_total: 365
summary_level: d0
token_count: 349
type: summary
---
# Phase 17: Wizard Chess Rollout

Phase 17 integrates a personality-driven, Stockfish-backed chess engine into the MyAika architecture. This implementation features a Three.js/GSAP-based UI for visual arena interactions and automated verification pipelines.

## Architectural Components
*   **Engine Handling:** Server-side UCI orchestration via `apps/server/src/chess/stockfishEngine.js`.
*   **UI Integration:** React-based `apps/web/src/components/WizardChessPanel.jsx` utilizing `chess.js` and `chessground` for state management and GSAP for animations.
*   **Verification:** Automated smoke testing and rollout completion scripts found in `scripts/ui_wizard_chess_smoke.js` and `scripts/verify_rollout_completion.ps1`.

## Key Specifications & Constraints
*   **Performance:** Engine move response times are strictly constrained between 120ms and 5000ms.
*   **Workflow:** UI interactions trigger engine requests via UCI protocols, which are then processed through a personality-driven reaction layer before triggering visual animations.
*   **Dependencies:** Requires `chess.js`, `chessground`, `GSAP`, and a configured `WIZARD_CHESS_ENGINE_PATH`.
*   **Operational Rule:** Smoke tests must clear `apps/web/.next` and utilize dynamic port fallback mechanisms.

For granular implementation details, refer to the full documentation in `docs/PHASE17_WIZARD_CHESS_VERIFICATION_2026-03-27.md`.