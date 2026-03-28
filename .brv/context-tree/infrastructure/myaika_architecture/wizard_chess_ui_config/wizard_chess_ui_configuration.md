---
title: Wizard Chess UI Configuration
tags: []
keywords: []
importance: 70
recency: 1
maturity: validated
updateCount: 4
createdAt: '2026-03-27T21:21:35.212Z'
updatedAt: '2026-03-28T20:46:54.041Z'
---
## Raw Concept
**Task:**
Wizard Chess runtime reliability and UI configuration

**Changes:**
- Implemented robust engine fallback across AIKA server endpoints
- Added non-JSON response handling in postEngineRequest
- Configured UI persistence with localStorage v2
- Optimized speech synthesis parameters and debounce logic

**Flow:**
buildEngineServerCandidates -> resolveServerUrl -> postEngineRequest -> validate Response -> process chess move

**Timestamp:** 2026-03-28

## Narrative
### Structure
Wizard Chess UI integrates with local AIKA servers via engine fallback logic. Engine fallback iterates through ports 8790, 8791, 8787. Response parsing handles invalid JSON/HTML to prevent crashes.

### Dependencies
Chessground for board rendering, GSAP for battle FX, ResizeObserver for responsiveness.

### Highlights
Speech synthesis uses rate (0.85-1.2), pitch (0.85-1.35), volume (0.95). Battle FX triggered by piece captures with intensity 0.4-1.35.

### Rules
Rule 1: Engine requests must validate response (parse raw text) before JSON.parse()
Rule 2: Chess moves must match regex /^[a-h][1-8][a-h][1-8][qrbn]?$/
Rule 3: Speech debouncing set to 1200ms

### Examples
Engine fallback candidates: http://127.0.0.1:8791, http://localhost:8791, http://127.0.0.1:8790, http://localhost:8790, http://127.0.0.1:8787, http://localhost:8787

## Facts
- **engine_ports**: Engine fallback ports include 8790, 8791, 8787 [project]
- **speech_debounce**: Speech synthesis debounce is 1200ms [project]
