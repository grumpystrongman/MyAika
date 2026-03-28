# Wizard Chess Architecture (Phase 17)

Date: 2026-03-27  
Tranche: `JEF-75`

## Objective

Deliver a playable Wizard Chess prototype where Aika is a present, reactive opponent using a stable production stack.

## Foundation Decisions

- Board/UI foundation: `chessground`
- Rules/state: `chess.js`
- Engine lane: Stockfish (`stockfish` package) through server UCI endpoint
- Cinematic shell: `Three.js` (`WizardArenaScene`)
- Motion layer: `GSAP` pulse feedback
- Personality layer: event-driven reaction engine + local memory profile

## Service Boundaries

- Web UI (`apps/web`):
  - renders board, scene, controls, move list, Aika panel
  - emits local game events and asks server for engine move/hint
  - persists player-style memory in browser local storage
- Server (`apps/server`):
  - `/api/chess/presets`: difficulty metadata
  - `/api/chess/engine-move`: validated FEN -> Stockfish move/eval
  - supports softened move selection for fun-first presets

## Event Model (Stage 1)

Implemented event responses in UI/reaction layer for:

- `game_start`
- `move_made`
- `illegal_move_attempt`
- `capture`
- `check`
- `blunder`
- `brilliant_move`
- `promotion`
- `opening_detected`
- `checkmate`
- `resignation`

Each event can affect:

- Aika chat line
- mood/state badge
- board pulse style
- atmospheric scene pulse input

## Implemented Files

- `apps/server/src/chess/stockfishEngine.js`
- `apps/server/index.js` (new chess API routes)
- `apps/web/pages/wizard-chess.jsx`
- `apps/web/pages/_app.jsx` (Chessground CSS imports)
- `apps/web/src/components/WizardChessPanel.jsx`
- `apps/web/src/components/WizardArenaScene.jsx`
- `apps/web/src/wizardChess/presets.js`
- `apps/web/src/wizardChess/openingBook.js`
- `apps/web/src/wizardChess/memory.js`
- `apps/web/src/wizardChess/reactions.js`
- `scripts/ui_wizard_chess_smoke.js`

## Verification Hooks

- Browser test hook exposed in `WizardChessPanel.jsx`:
  - `window.__WIZARD_CHESS_TEST.playUci(uci)`
  - `window.__WIZARD_CHESS_TEST.getFen()`
  - `window.__WIZARD_CHESS_TEST.getHistory()`

- Rollout verifier now includes:
  - `UI wizard chess cohort` via `scripts/ui_wizard_chess_smoke.js`

## Notes

- Stage 1 target (playable prototype) is complete and verified.
- Stage 2+ (richer piece-combat choreography, voice depth, cinematic finishers, boss/story modes) remains extensibility scope.
