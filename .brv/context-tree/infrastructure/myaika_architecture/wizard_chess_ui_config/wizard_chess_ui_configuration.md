---
title: Wizard Chess UI Configuration
tags: []
keywords: []
importance: 55
recency: 1
maturity: draft
updateCount: 1
createdAt: '2026-03-27T21:21:35.212Z'
updatedAt: '2026-03-28T18:56:29.991Z'
---
## Raw Concept
**Task:**
Configure Wizard Chess UI and Engine Integration

**Changes:**
- Implemented WebGL-safe fallback for white-screen issues
- Configured Next.js dev server for 127.0.0.1:3105
- Added UI preference persistence via localStorage
- Implemented engine move parsing and promotion handling

**Flow:**
initialize UI -> hydrate prefs -> arena scene setup -> WebGL context monitoring -> engine move processing

**Timestamp:** 2026-03-28

## Narrative
### Structure
The UI utilizes WizardChessPanel for state and WizardArenaScene for 3D rendering. Persistence is handled by localStorage with key "aika_wizard_chess_ui_v2".

### Dependencies
Requires three.js for 3D, gsap for animations, and chess.js for engine logic. Next.js dev server must be bound to 127.0.0.1:3105.

### Highlights
WebGL-safe fallback prevents white-screen loops on context loss. Engine move protocol ensures standard UCI compliance with promotion normalization.

### Rules
1. WebGL context lost must trigger static CSS overlay fallback.
2. Next.js must be bound to 127.0.0.1:3105.
3. Pawn promotion suffixes are mandatory for chess.js compatibility.

## Facts
- **ui_persistence**: UI preferences are stored in localStorage with key aika_wizard_chess_ui_v2 [project]
- **engine_api**: Engine move protocol uses 127.0.0.1:8790/api/chess/engine-move [project]
- **dev_server_port**: Next.js dev server must use port 3105 [project]
