---
title: Wizard Chess Visual Overhaul
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-28T20:35:47.078Z'
updatedAt: '2026-03-28T20:35:47.078Z'
---
## Raw Concept
**Task:**
Document Wizard Chess visual overhaul and 3D combat integration

**Changes:**
- Introduced role-aware 3D combat actors in WizardArenaScene
- Upgraded board piece rendering with figurine-like shading and pedestals
- Implemented battle cue-triggered combat animations
- Added skin-based asset generation for 10 factions

**Files:**
- scripts/generate_wizard_piece_svgs.mjs

**Flow:**
Battle cue -> resolveArmyBattleProfile -> resolveBattleCue -> trigger combat animation sequence -> play voice synthesis

**Timestamp:** 2026-03-28

## Narrative
### Structure
The overhaul integrates 3D rendering (WizardArenaScene) with state management (WizardChessPanel) and asset generation scripts. It uses GSAP for combat sequences and persistence via localStorage.

### Dependencies
Requires THREE.js for WebGL rendering, GSAP for animations, and browser SpeechSynthesis API.

### Highlights
Supports 10 distinct factions with SVG-based piece styling. Implements graceful degradation to 2D background if WebGL is unavailable.

### Rules
Voice synthesis must use pitch range 0.85-1.35 and rate 0.85-1.2. Piece sprites must follow --wizard-piece-{color}-{piece} naming convention.

### Examples
Battle cues include: thrust, slash, prayer, smash, cast, command.

## Facts
- **wizard_chess_factions**: Wizard Chess supports 10 factions including mythic_realms and starward_legions. [project]
- **wizard_chess_assets**: Piece rendering uses SVG packs at apps/web/public/wizard-assets/pieces/ [project]
- **wizard_chess_animations**: Combat animations use GSAP timelines with smoothStep easing. [project]
