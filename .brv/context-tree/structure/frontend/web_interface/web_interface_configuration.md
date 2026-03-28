---
title: Web Interface Configuration
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T18:15:01.047Z'
updatedAt: '2026-03-27T18:15:01.047Z'
---
## Raw Concept
**Task:**
Document Web Interface (apps/web/pages/index.jsx) configuration and state management

**Changes:**
- Phase 13 hardening: Added polling loop for approval status sync

**Files:**
- apps/web/pages/index.jsx

**Flow:**
Resolve server URL -> Initialize UI themes/avatars -> Manage state hooks -> Sync status via polling

**Timestamp:** 2026-03-27

## Narrative
### Structure
The web interface manages UI state, theme configuration, and assistant interactions. It utilizes React hooks for state management and Web Audio API for TTS.

### Dependencies
Relies on /api/approvals for status sync, /api/assistant/profile for persistence, and local storage for legacy migrations.

### Highlights
Supports multiple themes and avatars. Includes emotion-based speech tuning. Implements debounced preference persistence.

### Rules
Rule 1: Always check process.env.NEXT_PUBLIC_SERVER_URL before falling back to window.location.origin.
Rule 2: Debounce preference persistence by 500ms.
Rule 3: Use splitSpeechText for TTS chunking (max 180 chars).

### Examples
Emotion tuning: Happy mood increases rate by 0.08 and pitch by 0.6.

## Facts
- **tts_chunking**: Always use splitSpeechText to chunk text into max 180 chars [convention]
- **preference_persistence**: Preference persistence is debounced by 500ms [project]
- **server_url_resolution**: Server URL resolution checks process.env.NEXT_PUBLIC_SERVER_URL first [project]
