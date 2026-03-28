# Wizard Assets Pipeline

This folder is the stable media boundary for Wizard Chess visual packs.

## Purpose
- Keep race/universe graphics modular and replaceable.
- Separate gameplay logic from media payloads.
- Support future image/model generated assets without touching board logic.

## Expected Structure
- `packs_manifest.json`: pack metadata + style references
- `sprites/`: optional piece sprite sheets
- `cutscenes/`: optional battle backgrounds and overlays
- `audio/`: optional layered SFX and stingers

## Current State
- Runtime currently uses generated SVG piece models + GSAP + CSS effects.
- Piece assets are generated via:
  - `node scripts/generate_wizard_piece_svgs.mjs`
- This folder provides the extension point for richer external assets.
