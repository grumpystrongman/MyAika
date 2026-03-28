---
title: Wizard Chess Phases 25-28
tags: []
related: [infrastructure/myaika_architecture/phase_21_24_wizard_chess/wizard_chess_phases_21_24.md]
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-28T19:21:38.779Z'
updatedAt: '2026-03-28T19:21:38.779Z'
---
## Raw Concept
**Task:**
Wizard Chess Phases 25-28 Completion

**Changes:**
- Fixed AI clock parity during engine thinking
- Enforced board squareness (dominant center layout)
- Implemented movement trail FX and capture duel cutscene overlays
- Added non-infringing universe packs with custom identities
- Expanded smoke tests for AI timer, board squareness, and battle states
- Deployed wizard-assets media pipeline

**Files:**
- apps/web/public/wizard-assets/

**Flow:**
engine-move -> battle/duel FX -> update UI -> log state

**Timestamp:** 2026-03-28

## Narrative
### Structure
Phase 25-28 focuses on polishing the Wizard Chess experience, specifically visual fidelity, engine-UI synchronization, and content expansion.

### Dependencies
GSAP for animations, Playwright for smoke testing, custom manifest-driven asset pipeline.

### Highlights
Universe packs provide thematically distinct board/army setups. Smoke tests ensure rigorous adherence to UI and AI logic constraints.

### Rules
Rule 1: UI_PREFS_KEY is "aika_wizard_chess_ui_v2".
Rule 2: Engine move endpoint is POST /api/chess/engine-move.
Rule 3: Board geometry must be within 0.06 of 1.0 ratio.

### Examples
Universe Pack "mythic_realms" uses obsidian_hall board and knight army.

## Facts
- **ui_prefs_key**: Default UI preferences use 'aika_wizard_chess_ui_v2' key [project]
- **engine_endpoint**: Engine move endpoint is POST /api/chess/engine-move [project]
- **board_geometry**: Board geometry must be within 0.06 of 1.0 ratio [convention]
