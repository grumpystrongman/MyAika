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
   - or one-shot PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/quick_start_aika.ps1`

Open:
- Web: http://localhost:3000
- Server health: http://localhost:8787/health

Default UI behavior:
- Voice Mode is on by default (auto-listen + auto-speak).
- Settings and advanced voice controls are behind the "Settings" button.
- Integrations are available under the "Integrations" tab.
- Skills are available under the "Skills" tab.

## Integrations (beta)
The Integrations tab lets you connect external services so Aika can:
- Post and respond on social channels (Facebook/Instagram)
- Message you (WhatsApp, Telegram, Slack, Discord)
- Access documents (Google Docs/Drive)
- Monitor Plex
- Use Fireflies.ai for meeting notes

Notes:
- Integrations are stubs until credentials are provided.
- Add the credentials in `apps/server/.env` and restart the server.

### Google Docs + Drive
1) Create an OAuth client in Google Cloud Console and set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (example: `http://localhost:8790/api/integrations/google/callback`)
2) Click "Connect" for Google Docs/Drive in the Integrations tab to complete OAuth.
3) Use these endpoints:
   - `POST /api/integrations/google/docs/create` `{ title, content }`
   - `POST /api/integrations/google/docs/append` `{ documentId, content }`
   - `POST /api/integrations/google/drive/upload` `{ name, content, mimeType }`

Docs: Google Docs API and Drive API. citeturn0search0turn0search1

### Fireflies.ai
Set `FIREFLIES_API_KEY` and restart the server, then call:
- `GET /api/integrations/fireflies/transcripts?limit=5`
- `GET /api/integrations/fireflies/transcripts/:id`
- `POST /api/integrations/fireflies/upload` `{ url, title, webhook, language }`

Fireflies GraphQL API docs. citeturn0search2

### Slack
Set `SLACK_BOT_TOKEN`, then call:
- `POST /api/integrations/slack/post` `{ channel, text }`

Slack chat.postMessage API. citeturn0search3

### Meta (Facebook/Instagram/WhatsApp)
These require a Meta developer app, approved permissions, and valid access tokens.
Once you have credentials, we can wire posting and messaging endpoints safely. citeturn0search4turn0search5

### Agent tasks (server)
Use `POST /api/agent/task` with:
- `plex_identity`
- `fireflies_transcripts` (payload `{ limit }`)
- `slack_post` (payload `{ channel, text }`)
- `telegram_send` (payload `{ chatId, text }`)
- `discord_send` (payload `{ text }`)

## Aika Tools v1 (MCP-lite)
Tools are exposed through the MCP-lite Tool Control Plane and can be tested from:
- **Tools** tab (raw tool runner + approvals + history)
- **Aika Tools** tab (forms for meetings, notes, todos, calendar, email, spreadsheet, memory, integrations, messaging)
- CLI: `node apps/server/cli/aika.js`

Key endpoints:
- `POST /api/tools/call` { name, params }
- `GET /api/tools/history`
- `GET /api/approvals`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/deny`
- `POST /api/approvals/:id/execute`

Google Docs folder structure created on demand:
- `/Aika/Meetings`
- `/Aika/Notes`
- `/Aika/MemoryVault/Tier1`
- `/Aika/MemoryVault/Tier2`
- `/Aika/MemoryVault/Tier3`
- `/Aika/SpreadsheetPatches`

Tier 3 memory is encrypted locally and stored in Google Docs as ciphertext.
Local cache and search are powered by SQLite (FTS5).

CLI examples:
- `node apps/server/cli/aika.js run notes.create --json "{\"title\":\"Test\",\"body\":\"Hello\",\"tags\":[\"demo\"],\"store\":{\"googleDocs\":false,\"localMarkdown\":true}}"`
- `node apps/server/cli/aika.js run meeting.summarize --json "{\"transcript\":\"Alice: kickoff\",\"store\":{\"googleDocs\":false,\"localMarkdown\":true}}"`
- `node apps/server/cli/aika.js approvals list`

## Aika Voice (GPT-SoVITS only)
Voice output defaults to Piper for fast local speech (configurable). Default voice is `en_GB-semaine-medium`. GPT-SoVITS is still supported for higher quality.

### Optional: Piper multi-voice (fast switching)
Piper is a lightweight local TTS engine with many downloadable voices. To use it:
1) Install Piper (Python): `pip install piper-tts`
2) Download voices into `apps/server/piper_voices/` (each voice requires `.onnx` + `.onnx.json`)
   - Windows: `npm run piper:voices`
   - macOS/Linux: `bash scripts/install_piper_voices.sh`
3) (Optional) Set `PIPER_DEFAULT_VOICE` in `apps/server/.env`
4) In Settings, choose **Engine = piper** and select a voice from the dropdown.

## Live2D Models (free-only)
We support multiple Live2D models with a dropdown. Free sample models from Live2D can be used:
- Hiyori Momose (anime girl)
- Niziiro Mao (anime girl)
- Tororo & Hijiki (creatures/monster-like)
- Shizuku (anime girl)
- Hibiki (anime girl)

Download the Live2D Sample Data (free) and place the runtime folders into:
`apps/web/public/assets/aika/live2d/hiyori/`,
`apps/web/public/assets/aika/live2d/mao/`,
`apps/web/public/assets/aika/live2d/tororo_hijiki/`

Then restart the web app (or click Refresh Models in Settings). The models will appear in the Avatar Model dropdown.

### Auto-import sample zips
1) Download the Live2D sample zip(s) from the official page.
2) Place the zip(s) into `data/live2d_import/`
3) Run: `npm run live2d:import`
4) Restart the web app.

### Live2D core runtime
Live2D requires the Cubism core runtime files:
- `live2dcubismcore.js` (required)
- `live2dcubismcore.wasm` (if provided)
Place them in `apps/web/public/assets/aika/live2d/` or upload them in Settings ? Avatar Model.

### In-app import (no restart)
Use Settings → Avatar Model → Import Live2D zip to upload a zip. The server will unpack it, add it to the model list,
and the picker updates immediately without restarting.

## Skills (local-first)
The Skills tab provides lightweight, local utilities that respond instantly without calling the LLM.

Available skills:
- **Time & Date**: Ask “what time is it” or “what’s today’s date.”
- **Quick Notes**: “Note: call the dentist at 3pm.” “List notes.” “Clear notes.”
- **Tasks & Todos**: “Add todo buy milk.” “List todos.” “Complete todo <id>.”
- **System Status**: “System status” to see CPU/memory/uptime.
- **Shopping List**: “Add milk to shopping list.” “List shopping list.”
- **Reminders**: “Remind me at 3pm to call mom.” “Remind me in 15 minutes to stretch.”
- **Webhooks**: Configure in Skills tab, then say “Trigger lights_on.”
- **Scenes**: Group multiple webhooks. “Run scene morning.”
- **Meeting Recorder**: Start/Stop in Skills tab, then Generate Summary.

All skill toggles are stored locally. Skill activity is visible in the Debug tab.

### Skills data & exports
Skills data is stored locally under `data/skills/`. You can download exports from the Skills tab.

### Webhook safety
Optional allowlist: set `SKILLS_WEBHOOK_ALLOWLIST` to a comma-separated list of allowed hostnames.

### Reminders
Reminders create a local notification banner in the UI when due. Use “List reminders” to review.
You can enable a beep and browser push notification in the Skills tab.

### Meeting Recorder
Uses browser speech recognition to capture transcript, then generates a shareable summary document via OpenAI.
The document is saved under `data/meetings/` and accessible from the generated link.

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

### Performance / latency tuning
To get fast, natural responses (ChatGPT-like):
- Ensure GPT-SoVITS is running on GPU:
  - `apps/server/gptsovits_tts_infer_v3.yaml` is configured for `device: cuda` and `is_half: true`.
  - If you do not have a compatible GPU, set `device: cpu` and `is_half: false` (slower).
- Keep reference WAVs short and clean (3–10s).
- Use the "Fast replies" toggle in the UI. It:
  - reduces LLM output length
  - uses faster GPT-SoVITS settings (smaller `sample_steps`, shorter text splits)

You can fine-tune speed vs quality in `apps/server/.env`:
- `GPTSOVITS_SAMPLE_STEPS` and `GPTSOVITS_FAST_SAMPLE_STEPS`
- `GPTSOVITS_TEXT_SPLIT_METHOD` and `GPTSOVITS_FAST_SPLIT_METHOD`
- `GPTSOVITS_PARALLEL_INFER`

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

### Free Live2D model options (licensed)
Recommended starter model: Hiyori Momose (FREE) from Live2D Sample Data.
These assets require accepting Live2D's Free Material License Agreement and have
commercial-use limits depending on your organization size. Download and extract
the model into `apps/web/public/assets/aika/live2d/`.

Download links (read license first):
```
https://www.live2d.com/en/learn/sample/
https://www.live2d.com/en/cubism/download/editor_dl/
```

### Demo
Open: `http://localhost:3000/avatar-demo`

### Tuning
- Expression mapping: `apps/web/src/avatar/Live2DWebEngine.ts` (mood -> expression)
- Mouth/eyes params: `apps/web/src/avatar/Live2DWebEngine.ts` (`ParamMouthOpenY`, `ParamEyeBallX`)
- Fallback styling: `apps/web/src/avatar/PngAvatarEngine.ts`
## FAQ

### Why does the UI show "GPT-SoVITS: offline"?
The GPT-SoVITS service is not running or not reachable at `GPTSOVITS_URL`.
- Start it with `npm run gptsovits`.
- Verify `GPTSOVITS_PORT` and `GPTSOVITS_URL` match.

### Why do I see 405 Method Not Allowed for /tts?
This is normal for browser OPTIONS/GET requests. The service expects POST.

### Why does it say "Reference audio is outside the 3-10 second range"?
GPT-SoVITS requires a 3-10s reference clip. Use a clean short clip.
The app auto-trims `fem_aika.wav` to 6 seconds on first load.

### I hear no audio but text replies fine. What should I check?
- Confirm the GPT-SoVITS service is running.
- Check the browser devtools console for audio playback errors.
- Verify your system output device and volume.

### It is slow on the first run. Is that normal?
Yes. GPT-SoVITS loads models and warms up on first use. Subsequent replies should be faster.

### How do I change the voice?
Replace or add a reference WAV in `apps/server/voices/` and use it in the UI.
Keep the clip short and clean (3-10 seconds).

### Where is the Live2D model configured?
`apps/web/src/components/AikaAvatar.tsx` uses `LIVE2D_MODEL_URL`.
Place Live2D exports in `apps/web/public/assets/aika/live2d/`.

## MCP-lite Tool Control Plane
This repo includes an MCP-lite policy + approvals + audit layer for tools. See `docs/MCP_LITE.md` and run `node scripts/mcp_smoke_test.js`.

## Features tab
Use the Features tab in the web app to discover MCP tools and manage connections.

See `docs/QA_CHECKLIST.md` for validation steps.
