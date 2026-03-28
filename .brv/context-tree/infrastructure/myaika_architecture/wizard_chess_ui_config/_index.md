---
children_hash: 508547dbde45cf32310cffda668e3a5bada55b2ee13af9e91a32afa34cd7b1e0
compression_ratio: 0.8136645962732919
condensation_order: 0
covers: [wizard_chess_ui_configuration.md]
covers_token_total: 161
summary_level: d0
token_count: 131
type: summary
---
# Wizard Chess UI Configuration

Wizard Chess integrates into the Duel Chamber via `apps/web/src/components/WizardChessPanel.jsx`. 

**Core Stack:**
* **Logic/Board:** `chess.js` and `chessground`.
* **Animations:** GSAP.
* **Configuration:** Themes/Army packs are managed via `apps/web/src/wizardChess/universePacks.js`.
* **Persistence:** UI preferences utilize `localStorage`.

**Key Artifacts:**
* Smoke test script: `scripts/ui_wizard_chess_smoke.js`.
* Registry: `universePacks.js` handles board and thematic assets.