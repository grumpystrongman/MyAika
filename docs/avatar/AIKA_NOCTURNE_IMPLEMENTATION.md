# AIKA Nocturne Avatar Implementation

Date: 2026-04-12

## 1. Current-State Repo Analysis

### MyAika
- Frontend: Next.js + React (`apps/web`), avatar rendering through `AikaAvatar.tsx` with Live2D fallback.
- Runtime: Express server (`apps/server/index.js`) with `/chat`, STT, TTS (`GPT-SoVITS` and `Piper`).
- Existing avatar modules: `apps/server/src/avatar/*` were present but not mounted cleanly and had runtime defects.
- Existing gaps fixed in this pass:
  - broken avatar bridge syntax
  - inconsistent voice instruction contract
  - expression map/schema mismatches
  - no policy gating on avatar file-import writes

### MyAikaPersonalAssistant
- Frontend avatar layer mirrors MyAika cinematic files.
- No dedicated server avatar runtime module currently mounted.

### OpenAegis
- Policy and governance platform.
- No direct runtime coupling to MyAika avatar endpoints before this pass.
- Added integration guidance document for policy alignment.

## 2. Target Architecture
- Keep MyAika as active production runtime.
- Use original built-in portrait avatar as default model (`AIKA Nocturne`) with cinematic canvas fallback and Live2D import path still available.
- Mount dedicated avatar runtime API under `/api/aika/avatar/runtime`.
- Keep chat + TTS flow intact and feed behavior state to avatar (mood/speaking/listening).
- Gate avatar asset writes using existing policy execution layer (`executeAction`).

## 3. Chosen Stack and Justification

### Avatar rendering
- Stack: browser-native portrait canvas engine + cinematic 2D canvas fallback + Live2D optional.
- Why: lowest latency, no heavyweight desktop engine dependency, fast deployment in existing web app, and a direct path to a more human-looking original host using generated portrait plates plus full-frame blink and mouth variants.
- Main runtime behavior: portrait engine now accepts scheduled lipsync cues from the avatar runtime preview API and uses them to drive mouth openness and rounded-vowel shapes during actual TTS playback on the main chat page.

### Voice stack
- STT: existing browser + server STT paths.
- TTS: GPT-SoVITS/Piper preserved, with OpenAI TTS added as the production fallback path when local engines are unavailable.
- Why: keeps the repo's local-engine path intact while ensuring a working premium voice route with the credentials already present in the environment.

### Lipsync
- Runtime viseme generation via `lipsyncEngine` + frontend amplitude speaking animation.
- Added runtime lipsync preview endpoint for renderer integration.

## 4. Integration Plan Implemented
- Mount avatar runtime bridge: `/api/aika/avatar/runtime/*`
- Keep existing `/api/aika/avatar/*` model management routes.
- Add built-in portrait model entry (`aika_nocturne_portrait`) and keep built-in cinematic fallback so avatar works without external model packs.
- Apply policy checks to avatar import/core/refresh writes.

## 5. File/Folder Change Plan Executed

### MyAika
- `config/avatar/characterSpec.json`
- `config/avatar/expressionMap.json`
- `apps/server/index.js`
- `apps/server/aika_config.json`
- `apps/server/aika_voice/index.js`
- `apps/server/aika_voice/engine_openai.js`
- `apps/server/aika_voice/formatter.js`
- `apps/server/aika_voice/settings.js`
- `apps/server/storage/assistant_profile.js`
- `apps/server/src/avatar/avatarBridge.js`
- `apps/server/src/avatar/emotionController.js`
- `apps/server/src/avatar/index.js`
- `apps/server/src/avatar/interactionRuntime.js`
- `apps/server/src/avatar/voiceProsody.js`
- `apps/server/tests/avatar.test.js`
- `apps/web/public/assets/aika/live2d/models.json`
- `apps/web/public/assets/aika/portraits/nocturne-human/base.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/blink.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-open-soft.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-open-medium.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-open-wide.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-round.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-closed-press.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-lip-bite.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/config.json`
- `apps/web/public/assets/aika/portraits/nocturne-human/favicon.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/generation-prompt.txt`
- `apps/web/pages/index.jsx`
- `apps/web/src/avatar/CinematicAvatarEngine.ts`
- `apps/web/src/avatar/AvatarEngine.ts`
- `apps/web/src/avatar/PortraitAvatarEngine.ts`
- `apps/web/src/avatar/Live2DWebEngine.ts`
- `apps/web/src/components/AikaAvatar.tsx`
- `apps/web/src/components/AvatarRenderer.jsx`
- `apps/web/src/components/AvatarUI.jsx`
- `apps/web/src/pages/avatar-demo.jsx`
- `packages/shared/src/index.js`
- `scripts/generate_nocturne_portrait_assets.mjs`
- `docs/avatar/AIKA_NOCTURNE_REFERENCE_TRANSLATION.md`

### MyAikaPersonalAssistant
- `apps/server/index.js`
- `apps/server/aika_voice/index.js`
- `apps/server/aika_voice/engine_openai.js`
- `apps/server/aika_voice/settings.js`
- `apps/server/storage/assistant_profile.js`
- `apps/server/src/avatar/*`
- `apps/web/public/assets/aika/live2d/models.json`
- `apps/web/public/assets/aika/portraits/nocturne-human/base.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/blink.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-open-soft.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-open-medium.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-open-wide.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-round.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-closed-press.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/mouth-lip-bite.png`
- `apps/web/public/assets/aika/portraits/nocturne-human/config.json`
- `apps/web/public/assets/aika/portraits/nocturne-human/favicon.png`
- `apps/web/src/components/AikaAvatar.tsx`
- `apps/web/src/avatar/CinematicAvatarEngine.ts`
- `apps/web/src/avatar/AvatarEngine.ts`
- `apps/web/src/avatar/Live2DWebEngine.ts`
- `apps/web/src/avatar/PortraitAvatarEngine.ts`
- `apps/web/src/pages/avatar-demo.jsx`
- `apps/web/pages/index.jsx`
- `apps/web/pages/_app.jsx`

### OpenAegis
- `docs/integrations/myaika-avatar-runtime.md`

## 6. Security and Policy
- Avatar file operations now flow through `executeAction` with `actionType=file.write`.
- This applies risk scoring, allowlist checks, protected path checks, and approval support.
- Upload temp files are cleaned in `finally` blocks.

## 6.1 Legacy Archive
- Celebrity-specific legacy experiment files are archived under `archive/legacy/elvira/`.
- They are retained for record-keeping only and are not part of the active runtime, public routes, or deployment path.

## 7. Run / Deploy Instructions
- Server (MyAika): `npm run dev:server`
- Web (MyAika): `npm run dev:web`
- Web (MyAikaPersonalAssistant): `npm run dev:web`
- Avatar demo: `http://localhost:3000/avatar-demo`
- Main app: `http://localhost:3000/`
- Current production-safe default voice path: OpenAI TTS when `OPENAI_API_KEY` is present and local Piper voices are not configured.

Runtime endpoints:
- `POST /api/aika/avatar/runtime/initialize`
- `POST /api/aika/avatar/runtime/interaction/user-input`
- `POST /api/aika/avatar/runtime/interaction/agent-output`
- `POST /api/aika/avatar/runtime/lipsync/preview`
- `POST /api/aika/avatar/runtime/lipsync/preview` (mirrored in `MyAikaPersonalAssistant`)

## 8. Validation / Tests Run
- `node --check apps/server/index.js`
- `node --check apps/server/aika_voice/index.js`
- `node --check scripts/generate_nocturne_portrait_assets.mjs`
- `node --check apps/server/src/avatar/avatarBridge.js`
- `node --check apps/server/src/avatar/interactionRuntime.js`
- `node --check apps/server/src/avatar/voiceProsody.js`
- `node --test apps/server/tests/avatar.test.js`
- `node --test apps/server/tests/avatar_qa.test.js`
- `npm run build -w apps/web` (MyAika)
- `npm install` (MyAikaPersonalAssistant)
- `npm run build -w apps/web` (MyAikaPersonalAssistant)
- Playwright browser validation against `http://127.0.0.1:3310/avatar-demo` and `http://127.0.0.1:3311/avatar-demo`
- Screenshots captured in `output/playwright/`
- `node --check apps/server/index.js` (MyAikaPersonalAssistant)
- `node --check apps/server/aika_voice/index.js` (MyAikaPersonalAssistant)
- `node -e "import('./apps/server/src/avatar/index.js')"` equivalent import smoke check in `MyAikaPersonalAssistant`
- Direct `POST /api/aika/voice/inline` smoke checks returned `200 OK` with `audio/wav` in both repos
- Direct `POST /api/aika/avatar/runtime/lipsync/preview` smoke checks returned `200 OK` in both repos
- Fresh runtime validation on clean ports confirmed digraph phonemes (`th`, `sh`, `ch`) now survive the lipsync preview route and reach the portrait renderer
- Fresh asset validation on `3112` and `3113` confirmed new rig overlays resolve: `front-hair`, `eye-gloss`, `jaw-shadow`, `makeup-*`, and `cheek-*`
- Fresh asset validation on `3112` and `3113` confirmed extracted slice layers resolve: `layer-face-core`, `layer-eye-core`, `layer-mouth-core`, and `layer-hair-shell`
- Fresh `/avatar-demo` browser validation on `3112` and `3113` confirmed eased conversation-state curves now drive distinct listen/think/answer presentation instead of hard state snaps
- Fresh `teasing` browser validation confirmed the portrait runtime now supports a dedicated teasing expression path with asymmetric brow/eye behavior and subtler eye-layer rigging
- Playwright main-page validation on `http://127.0.0.1:3012/` and `http://127.0.0.1:3013/` confirmed:
  - voice settings page selected `openai`
  - `POST /api/aika/voice/inline` returned `200 OK`
  - `POST /api/aika/avatar/runtime/lipsync/preview` returned `200 OK`

## 9. Acceptance Checklist
- [x] New original gothic-hostess AIKA identity implemented
- [x] Avatar renders in platform with built-in portrait default
- [x] Voice prompt/presets updated for dark-glamour delivery
- [x] OpenAI TTS fallback added so the main UI still speaks when GPT-SoVITS is offline
- [x] Lipsync generation endpoint active and tested
- [x] Idle/listening/speaking behaviors wired
- [x] Dedicated portrait blink and multi-shape mouth variant plates generated and wired
- [x] Consonant-specific mouth plates added for `m/b/p` and `f/v`
- [x] Portrait runtime upgraded from full-frame plate swaps to clipped eye and mouth feature-zone redraws
- [x] Separate brow lift and brow knit plates added and blended as feature zones
- [x] Added phoneme-specific mouth plates for `ee`, `ah`, `oh`, `sibilant`, and `tongue`
- [x] Lipsync tokenizer upgraded so `th`, `sh`, and `ch` survive routing to the portrait engine
- [x] Added pseudo-layer rig overlays for front hair, eye gloss, and jaw shadow with independent motion scaling
- [x] Added mood-specific eye makeup and cheek-shadow plates to improve emotional camera readability
- [x] Added extracted layer groups from the base portrait for face, eyes, mouth, and hair shell
- [x] Added finer eye/hair slice layers for iris, lid, and fringe refinement
- [x] Mood cosmetics now ease in/out over time instead of snapping directly on mood change
- [x] Added eased conversation-state timing curves for listen, think, answer, and interrupt across gaze, breath, brows, overlays, and halo behavior
- [x] Added dedicated `teasing` mood support so face and voice styling stay aligned
- [x] Main chat page TTS playback now schedules portrait viseme cues from runtime preview instead of relying only on RMS mouth pulsing
- [x] Emotion/personality mapping expanded
- [x] Policy-gated avatar file writes implemented
- [x] MyAikaPersonalAssistant mirrored to the portrait path and validated
- [x] Browser console clean during live `/avatar-demo` validation
- [x] Implementation documented with run/test guidance

## 10. Compliance Note
This implementation intentionally avoids direct celebrity face/voice cloning and uses an original character profile with archetype-level styling only.

## 11. Voice Runtime Notes
- Legacy persisted profile settings that hard-pinned `piper` plus `riko_sample.wav` are migrated to `openai` with blank local speaker references.
- The OpenAI route only accepts supported OpenAI voice ids; legacy desktop SAPI names are filtered out before request dispatch.
- `nocturne_hostess`, `nocturne_velvet`, and `nocturne_command` now map to supported OpenAI voices with tighter low-register prompt instructions instead of generic style text.
