# Aika Avatar Engine (Live2D + PNG fallback)

## Assets
- PNG fallback (only used if WebGL is unavailable):
  - `/public/assets/aika/live2d/placeholder.svg`
- Live2D models (Cubism 4):
  - `/public/assets/aika/live2d/models.json` (generated via Refresh or Import)
  - Model files live under `/public/assets/aika/live2d/<model-id>/`

## Runtime (Pixi Live2D)
The web app uses `pixi.js` (v6) + `pixi-live2d-display` (Cubism 4) to render models client-side.
No global Cubism runtime is required; the Cubism 4 runtime is bundled by pixi-live2d-display.

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


## Troubleshooting
- If the model fails to render, open the browser console and check for Live2D load errors.
- Ensure the model's `.model3.json` and referenced textures are inside `/public/assets/aika/live2d/<model-id>/`.
- Try hard reload (Ctrl+Shift+R).

## Live2D core runtime
Place `live2dcubismcore.js` (and `live2dcubismcore.wasm` if provided) under `/public/assets/aika/live2d/`.
You can also upload them from the Settings ? Avatar Model panel.

## Motion + lip-sync
- Random motions are triggered periodically when available.
- Lip-sync uses the actual audio output level and drives `ParamMouthOpenY`.
