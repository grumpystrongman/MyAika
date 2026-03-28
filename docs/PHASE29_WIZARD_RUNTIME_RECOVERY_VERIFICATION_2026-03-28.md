# AIKA Phase 29 Verification (Vendor Chunk Runtime Recovery)

Date: 2026-03-28  
Linear: JEF-88

## Implemented
- Added deterministic launcher: `scripts/start_wizard_chess_dev.ps1`.
- Launcher now:
  - stops stale process on wizard port,
  - retries `.next` cleanup,
  - starts `next dev` bound to `127.0.0.1:3105`.
- Added root scripts:
  - `npm run dev:wizard`
  - `npm run dev:wizard:fg`

## Evidence
- Wizard smoke PASS after launcher reset path.
- Full rollout verifier PASS across all cohorts.

## Files
- `scripts/start_wizard_chess_dev.ps1`
- `package.json`
- `apps/web/package.json`
