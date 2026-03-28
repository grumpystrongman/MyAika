---
title: Phase 18 Wizard Chess Cinematic Overhaul
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T20:39:41.725Z'
updatedAt: '2026-03-27T20:39:41.725Z'
---
## Raw Concept
**Task:**
Complete cinematic overhaul of Wizard Chess module

**Changes:**
- Responsive layout stabilization
- Independent right-panel scrolling
- Board and army theme selectors
- GSAP battle animations
- Voice-first Aika interaction

**Files:**
- scripts/verify_rollout_completion.ps1
- scripts/ui_wizard_chess_smoke.js

**Flow:**
Initiate chess move -> Engine evaluation -> UI update -> GSAP battle sequence -> Voice feedback

**Timestamp:** 2026-03-27

## Narrative
### Structure
Cinematic overhaul including theme selectors (boards: Obsidian, Ember, Glade, Frost; armies: Knights, Elves, Orks, Spectral) and Three.js WizardArenaScene.

### Dependencies
GSAP for animations, Three.js for scene rendering, Web Speech API for voice feedback.

### Highlights
Responsive layout, independent scrolling, voice-first interaction support, GSAP-based battle animations.

### Rules
Voice synthesis must use rate 0.85-1.2, pitch 0.85-1.35, volume 0.95. Voices filtered for English support (zira, aria, samantha, female, luna, nova).

### Examples
Board themes: Obsidian Hall, Ember Forge, Moonlit Glade, Frost Keep.

## Facts
- **ui_prefs_key**: Wizard Chess UI prefs key is 'aika_wizard_chess_ui_v2' [project]
- **battle_animation_timing**: GSAP battle animation timeline sequence includes attacker strike (0.22s) and defender recoil (0.26s) [project]
