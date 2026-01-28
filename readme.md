# MyAika

MyAika is a companion app with:
- a "mind" (chat + memory + identity) in `apps/server`
- a "body" (UI + renderer) in `apps/web`
- shared schemas in `packages/shared`

This repo uses GPT-SoVITS for voice and locks voice output to GPT-SoVITS only (no fallback voices).

## Quick start (local dev)
1) Install deps: `npm install`
2) Server env:
   - Copy `apps/server/.env.example` to `apps/server/.env`
   - Set `OPENAI_API_KEY=...`
3) Start:
   - `npm run dev:server`
   - `npm run dev:web`

Open:
- Web: http://localhost:3000
- Server health: http://localhost:8787/health

## Aika Voice (GPT-SoVITS only)
Voice output is handled by a local GPT-SoVITS service. The app calls it and streams the WAV back.

### Why GPT-SoVITS
- Best quality for natural, non-robotic voice
- Fully local/offline after setup
- Supports reference voice conditioning

### Recommended setup (Windows, NVIDIA integrated package)
Use the NVIDIA integrated build. It bundles a compatible Python runtime and dependencies.

1) Download and extract the package (outside this repo)
2) In `apps/server/.env` set:
   - `TTS_ENGINE=gptsovits`
   - `GPTSOVITS_REPO_PATH=C:\path\to\GPT-SoVITS` (folder that contains `api_v2.py`)
   - `GPTSOVITS_PYTHON_BIN=C:\path\to\GPT-SoVITS\runtime\python.exe`
   - `GPTSOVITS_PORT=9882`
   - `GPTSOVITS_URL=http://localhost:9882/tts`
3) Start GPT-SoVITS:
   - `npm run gptsovits`
4) Start the app:
   - `npm run dev:server`
   - `npm run dev:web`

If `npm run gptsovits` fails, check the paths above first.

### Reference voice (required for best quality)
Put reference WAVs in `apps/server/voices/`.

Rules:
- 3 to 10 seconds in length (GPT-SoVITS requirement)
- Clean, single-speaker audio

Auto-trim behavior:
- `apps/server/voices/fem_aika.wav` is auto-trimmed to 6 seconds on first load
- The trimmed file is cached as `fem_aika_trim_6s.wav`

### Voice prompt
In the UI, the "Voice prompt text" is sent to GPT-SoVITS. Keep it short and descriptive
of the target voice.

### Endpoints
- `POST /api/aika/voice` body: `{ text: string, settings?: object }`
- `GET /api/aika/voice/:id` streams audio

### Manual smoke test
- `npm run tts` (prints file path + metadata)

### Troubleshooting
- `GPT-SoVITS: offline` in UI: the GPT-SoVITS service is not reachable.
- 405 Method Not Allowed for `/tts`: expected for browser OPTIONS/GET requests.
- 400 "Reference audio is outside 3-10 seconds": trim the WAV or let auto-trim run.
- If you changed ports, update both `GPTSOVITS_PORT` and `GPTSOVITS_URL`.

## Aika Avatar (Live2D + PNG fallback)
Avatar rendering is engine-based with Live2D Web + PNG fallback.

### Assets
- PNG fallback: `apps/web/public/assets/aika/AikaPregnant.png`
- Live2D model: `apps/web/public/assets/aika/live2d/model3.json`
  - Export your Cubism model to that folder.
  - Keep the entry file named `model3.json` (Cubism 4).
  - To change the entry file, update `LIVE2D_MODEL_URL` in
    `apps/web/src/components/AikaAvatar.tsx`.
  - See `apps/web/src/avatar/README.md` for expression naming and parameter mapping.

### Demo
Open: `http://localhost:3000/avatar-demo`

### Tuning
- Expression mapping: `apps/web/src/avatar/Live2DWebEngine.ts` (mood -> expression)
- Mouth/eyes params: `apps/web/src/avatar/Live2DWebEngine.ts` (`ParamMouthOpenY`, `ParamEyeBallX`)
- Fallback styling: `apps/web/src/avatar/PngAvatarEngine.ts`
