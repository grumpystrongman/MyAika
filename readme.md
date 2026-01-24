# MyAika

Aika is a companion app with:
- a “mind” (chat + memory + identity) in `apps/server`
- a “body” (UI + renderer) in `apps/web`
- shared schemas in `packages/shared`

## Local dev
1) Install deps: `npm install`
2) Server env:
   - Copy `apps/server/.env.example` to `apps/server/.env`
   - Set `OPENAI_API_KEY=...`
3) Run:
   - `npm run dev:server`
   - `npm run dev:web`

Open:
- Web: http://localhost:3000
- Server health: http://localhost:8787/health

## Aika Voice (local-first TTS)
Aika Voice adds a local Text-to-Speech pipeline with a persona formatter.

### Install (one-time)
1) Python 3.10+ recommended
2) Create and activate venv (optional but recommended)
3) Install Coqui TTS:
   - `pip install -r tts_service/requirements.txt`

### Configure
Update `apps/server/.env` (examples in `.env.example`):
- `TTS_ENGINE=coqui`
- `TTS_MODEL_ID=tts_models/multilingual/multi-dataset/xtts_v2`
- `TTS_FALLBACK_MODEL_ID=tts_models/en/ljspeech/tacotron2-DDC`
- `TTS_PYTHON_BIN=python`
- `TTS_CACHE_DIR=./data/aika_tts_cache`
- `TTS_VOICES_DIR=./apps/server/voices`
- `TTS_MAX_CHARS=600`
- `TTS_ENABLE_MP3=0` (set to 1 if you have ffmpeg)

Place optional speaker reference WAVs in `apps/server/voices/`.

#### Python 3.14 users (Windows)
Coqui TTS does not support Python 3.14. Use the built-in Windows voice engine:
- Set `TTS_ENGINE=sapi`
- Optionally set a Windows voice name in the UI (e.g. `Microsoft Zira Desktop`)

### Endpoints
- `POST /api/aika/voice` body: `{ text: string, settings?: object }`
- `GET /api/aika/voice/:id` streams audio

### Manual smoke test
- `npm run tts` (prints file path + metadata)

### Notes
- First run downloads the model; after that it works offline.
- MP3 requires `ffmpeg` and `TTS_ENABLE_MP3=1`.

## Aika Avatar (Live2D + PNG fallback)
Avatar rendering is now engine-based with a Live2D Web implementation and PNG fallback.

### Assets
- PNG fallback: `apps/web/public/assets/aika/AikaPregnant.png`
- Live2D model: `apps/web/public/assets/aika/live2d/model3.json`
  - Export your Cubism model to that folder.
  - Keep the entry file named `model3.json` (Cubism 4). If you use `model.json`, update `LIVE2D_MODEL_URL` in `apps/web/src/components/AikaAvatar.tsx`.
  - See `apps/web/src/avatar/README.md` for expression naming and parameter mapping.

### Demo
Open: `http://localhost:3000/avatar-demo`

### Tuning
- Expression mapping: `apps/web/src/avatar/Live2DWebEngine.ts` (mood → expression)
- Mouth/eyes params: `apps/web/src/avatar/Live2DWebEngine.ts` (`ParamMouthOpenY`, `ParamEyeBallX`)
- Fallback styling: `apps/web/src/avatar/PngAvatarEngine.ts`
