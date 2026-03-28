---
title: Wizard Chess Phases 21-24
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T21:21:35.206Z'
updatedAt: '2026-03-27T21:21:35.206Z'
---
## Raw Concept
**Task:**
Wizard Chess Phases 21-24 Rollout

**Changes:**
- Implemented responsive scroll lock and resize observer board sync
- Updated cinematic capture choreography v2 (rune/impact layers)
- Added voice profile controls with pacing gate
- Expanded board and army themes
- Integrated UI smoke test assertions

**Files:**
- apps/web/src/components/WizardChessPanel.jsx
- apps/web/src/wizardChess/themes.js
- apps/web/src/wizardChess/encounters.js
- scripts/ui_wizard_chess_smoke.js

**Timestamp:** 2026-03-27

## Narrative
### Structure
Phases 21-24 finalize the Wizard Chess interface, adding cinematic effects, voice pacing, and comprehensive themes.

### Highlights
Includes 6 board themes, 6 army profiles, and 6 encounter packs. Smoke testing verified via headless Chromium.

### Rules
Voice pacing gate: 1000ms minimum between utterances unless forced.

## Facts
- **wizard_chess_ui_prefs**: Default UI preferences key is aika_wizard_chess_ui_v2 [project]
- **wizard_chess_voice_rate**: Voice synthesis rate for Wizard Chess is 0.85-1.2 [project]
- **wizard_chess_voice_pitch**: Voice pitch for Wizard Chess is 0.85-1.35 [project]
