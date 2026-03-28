# AIKA Phase 31 Verification (Model-Aware Battle Scenes)

Date: 2026-03-28  
Linear: JEF-90

## Implemented
- Move FX layer with trail + impact for every move.
- Capture duel cutscene with model-aware attacker/defender units.
- Battle hooks extended for deterministic verification:
  - clocks via `getClocks()`
  - battle state via `getBattleState()`

## Evidence
- Wizard smoke PASS with:
  - AI clock decrement check,
  - board square ratio check,
  - battle/cutscene activation check.
- Full rollout verifier PASS (all cohorts).

## Files
- `apps/web/src/components/WizardChessPanel.jsx`
- `scripts/ui_wizard_chess_smoke.js`
- `apps/web/public/wizard-assets/packs_manifest.json`
