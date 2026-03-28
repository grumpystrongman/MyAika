# AIKA Phase 21 Verification (Wizard Chess Responsive Shell + Scroll Locks)

Date: 2026-03-27  
Linear: JEF-80

## Scope
- Harden Wizard Chess layout for repeated viewport changes.
- Guarantee independent right-panel comment stream scrolling.
- Preserve board playability under resize.

## Implemented
- Added `ResizeObserver` board redraw + state sync path in `WizardChessPanel`.
- Hardened panel layout constraints (`wizard-right`/`wizard-left` row templates, stable scroll gutters, overscroll containment).
- Updated viewport behavior for mobile breakpoints to avoid clipping and keep usable chat/board heights.

## Evidence
- Build: `npm run build -w apps/web` => PASS
- Full verifier: `powershell -ExecutionPolicy Bypass -File scripts/verify_rollout_completion.ps1` => PASS
- UI cohort: `UI wizard chess smoke passed.`
- New smoke assertions validate:
  - `.wizard-chat-stream` has scroll overflow behavior
  - overflow can be produced and measured
  - board/chat dimensions remain viable after viewport changes

## Files
- `apps/web/src/components/WizardChessPanel.jsx`
- `scripts/ui_wizard_chess_smoke.js`
