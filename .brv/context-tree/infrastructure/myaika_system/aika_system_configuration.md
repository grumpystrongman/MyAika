---
title: Aika System Configuration
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T18:12:53.909Z'
updatedAt: '2026-03-27T18:12:53.909Z'
---
## Raw Concept
**Task:**
Document Aika system state, UI preferences, and emotion tuning logic

**Changes:**
- Implemented shared performApprovalAction helper
- Synchronized tool/chat approval state
- Added emotion tuning parameters for various moods

**Files:**
- apps/server/index.js
- apps/server/memory.js

**Timestamp:** 2026-03-27

## Narrative
### Structure
Main chat interface manages UI tabs, approval states, and emotion-tuned TTS output.

### Dependencies
Uses Piper TTS engine with emotion-specific voice parameters (rate, pitch, energy, pause).

### Highlights
Supports multiple UI themes (Aurora Glass, etc.) and mood-based voice tuning (Happy, Shy, Sad, etc.).

### Rules
Emotion tuning intensity defaults to 0.35. TTS text chunking merges segments < 40 chars.

### Examples
Happy mood increases rate by 0.08 and pitch by 0.6.

## Facts
- **tts_engine**: Default TTS engine is Piper [project]
- **emotion_intensity**: Default emotion intensity is 0.35 [preference]
- **default_ui_tab**: Default UI tab is chat [preference]
