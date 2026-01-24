# Aika Avatar Engine (Live2D + PNG fallback)

## Assets
- PNG fallback:
  - `/public/assets/aika/AikaPregnant.png`
- Live2D model (Cubism 4):
  - `/public/assets/aika/live2d/model3.json`

If your entry file name differs, update:
- `LIVE2D_MODEL_URL` in `apps/web/src/components/AikaAvatar.tsx`

## Runtime (Cubism SDK for Web)
Include the Cubism runtime on the client so `window.Live2DCubismFramework` is available.
Place the runtime JS under `/public/assets/aika/live2d/` and include it via a script tag (e.g., in `pages/_document.js` or `pages/_app.js`).

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
