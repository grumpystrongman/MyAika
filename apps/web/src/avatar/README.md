# Aika Avatar Engine (Live2D + PNG fallback)

## Assets
- PNG fallback (only used if WebGL is unavailable):
  - `/public/assets/aika/live2d/placeholder.svg`
- Live2D models (Cubism 4):
  - `/public/assets/aika/live2d/models.json` (generated via Refresh or Import)
  - Model files live under `/public/assets/aika/live2d/<model-id>/`

## Runtime (Pixi Live2D)
The web app uses `pixi.js` + `pixi-live2d-display` to render models client-side.
No global Cubism runtime is required.

## Expression mapping
Suggested expression files:
- `exp_neutral`
- `exp_smile`
- `exp_think`
- `exp_worried`
- `exp_surprise`

Map moods to expression names in:
- `apps/web/src/avatar/Live2DWebEngine.ts` (`moodMap` + `setMood`)

## Mouth/Eyes parameters
Update parameter IDs in:
- `apps/web/src/avatar/Live2DWebEngine.ts`
  - Mouth: `ParamMouthOpenY`
  - Eyes: `ParamEyeLOpen`, `ParamEyeROpen`, `ParamEyeBallX`
