# MyAika

MyAika is a companion app with:
- a "mind" (chat + memory + identity) in `apps/server`
- a "body" (UI + renderer) in `apps/web`
- shared schemas in `packages/shared`

This repo uses GPT-SoVITS for voice and locks voice output to GPT-SoVITS only (no fallback voices).

## Project map (what & why)
- `apps/server`: API + orchestration for chat, memory, RAG (Fireflies + Trading), safety/approvals, integrations, and background jobs.
- `apps/web`: The primary UI (Chat, Recordings, Trading, Tools, Safety, Action Runner, Teach Mode).
- `packages/shared`: Shared types/schemas so server + web agree on payloads.
- `config/`: Safety policy config (`config/policy.json`) with deny-by-default rules.
- `data/`: Local storage (SQLite DBs, vector indices, action-run artifacts, skills/macros, audit logs).
- `docs/`: Product docs, QA checklists, UI walkthrough notes.
- `scripts/`: Local dev utilities, smoke tests, and scheduled task helpers.

Why this layout: keep the "mind" and "body" separate for reliability, allow local-only storage, and make safety/approvals a first-class system.

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

iPad/Safari microphone note:
- `getUserMedia` requires a secure context on iOS.
- Easiest path: `npm run dev:ipad` (starts server + web + HTTPS tunnel and prints a `https://...trycloudflare.com` URL for iPad, then falls back to localtunnel if needed).
- If running without tunnel, use HTTPS dev mode: `npm run dev:web:https`.

## Tests
- Run the full suite: `npm test`

## Auth + Multi-user (small group hosting)
Enable sign-in and per-user isolation:
- Set `AUTH_REQUIRED=1` and `AUTH_JWT_SECRET=...` in `apps/server/.env`.
- Configure allowlist via env (`AUTH_ALLOWED_EMAILS`, `AUTH_ALLOWED_DOMAINS`) or a JSON file (template: `config/auth_allowlist.example.json`, default path: `config/auth_allowlist.json`, override with `AUTH_ALLOWLIST_PATH`).
- Turn on strict isolation: `RAG_MULTIUSER_ENABLED=1` and `AIKA_STRICT_USER_SCOPE=1`.

Login flow:
- The web app will prompt for Google sign-in when auth is required.
- Sessions are stored as HttpOnly JWT cookies; all API calls use cookie auth.

## Worker (background jobs)
Run the worker loop separately from the API:
- `npm run worker` (or `npm run dev:worker`)
- For split deployments, set `WORKER_EXECUTION_MODE=off` on the API container and run the worker container.

## Docker (API + worker)
Build and run both services:
- `docker compose up --build`

Defaults:
- API: `http://localhost:8787`
- Worker shares the same `./data` and `./apps/server/data` volumes.

Default UI behavior:
- Voice Mode is on by default (auto-listen + auto-speak).
- Settings and advanced voice controls are behind the "Settings" button.
- Integrations are available under the "Integrations" tab.
- Skills are available under the "Skills" tab.
- Tools tab includes info icons explaining why/when to use each tool.

## Key UI panels (what & why)
- Chat: primary conversation, memory recall, and quick actions.
- Recordings: meeting capture, summaries, tasks, and transcript Q&A.
- Trading: market data, recommendations, and the Trading Knowledge RAG.
- Tools: direct access to structured tools with guided usage tips.
- Safety: policy config, approvals queue, audit log, kill switch.
- Action Runner / Teach Mode: automate browser flows, save reusable macros.

## Meeting Copilot (Recordings)
Meeting Copilot adds a one-click recorder, background transcription/summaries, and a recordings library.

UI:
- Use the **Start recording** button in the header or the **Recordings** tab.
- A recorder popup shows live waveform, elapsed time, and Pause/Resume/Stop.
- Voice commands are supported if you enable “Listening for voice commands” (say: “hey Aika, start recording”, “pause recording”, “resume recording”, “stop recording”).

## Daily Trading Picks Email
Configure daily trading picks in `apps/server/.env`:
- `TRADING_DAILY_EMAIL_ENABLED=1`
- `TRADING_DAILY_EMAIL_TIME=08:00`
- `TRADING_DAILY_EMAIL_RECIPIENTS=...`
- `TRADING_DAILY_STOCKS=...`
- `TRADING_DAILY_CRYPTOS=...`

Notes:
- Uses Gmail integration; must have `gmail.send` scope connected.
- Emails are subject to the Safety approval layer unless you remove `email.send` from approval rules.

## Trading Knowledge RAG (Local)
Trading knowledge is stored locally and is queryable from the Trading panel.

What it does:
- Builds a local knowledge library from sources, uploaded files, and RSS feeds.
- Shows a Knowledge Map (tags and relationships) plus Sources & Age to assess freshness.
- Supports tag filtering and a Q&A panel that uses RAG first, then LLM for depth.

How to use:
- Trading panel -> Knowledge tab.
- Import a URL or PDF, or upload a local file.
- Manage RSS sources and run a sync to ingest new items.

Key env:
- `TRADING_RSS_SYNC_ON_STARTUP=1` to crawl RSS on server start.
- `TRADING_RSS_SYNC_INTERVAL_MINUTES=1440` to control cadence.
- `TRADING_RAG_OCR_ENABLED=1` for OCR fallback on scanned PDFs.
- `TRADING_RAG_PDF_MAX_BYTES=20000000` to cap PDF size.

Backend endpoints:
- `POST /api/recordings/start` `{ title?, redactionEnabled?, retentionDays? }`
- `POST /api/recordings/:id/chunk` (multipart form-data, `chunk` file, `seq` query param)
- `POST /api/recordings/:id/final` (multipart form-data, `audio` file)
- `POST /api/recordings/:id/pause`
- `POST /api/recordings/:id/resume`
- `POST /api/recordings/:id/stop` `{ durationSec? }`
- `GET /api/recordings?status=&q=&limit=`
- `GET /api/recordings/:id`
- `GET /api/recordings/:id/audio`
- `POST /api/recordings/:id/ask` `{ question }`
- `POST /api/memory/ask` `{ question }`
- `POST /api/recordings/:id/actions` `{ actionType, input? }`
- `POST /api/recordings/:id/tasks` `{ tasks: [] }`
- `POST /api/recordings/:id/email` `{ to, subject? }` (sends via Gmail when connected; falls back to local outbox)

Emailing meeting notes:
- In the Recording Detail view, use **Email this meeting** to send notes/links to your work email.
- Includes links to notes, transcript, audio, and Google Doc (if available).
- Gmail send requires Google OAuth scope `https://www.googleapis.com/auth/gmail.send`. If your Google connection was created before this scope was added, reconnect Google once.
- By default, failed Gmail sends return an error (no outbox fallback). Set `EMAIL_OUTBOX_FALLBACK=1` only if you explicitly want local outbox fallback.

Retention:
- Set `RECORDING_RETENTION_DAYS` in `apps/server/.env` (default 30).

Transcription:
- If `OPENAI_API_KEY` is set, audio transcription uses `OPENAI_TRANSCRIBE_MODEL` (default: `whisper-1`).
- Without an API key, the pipeline runs in mock mode so the UI remains usable.

## Appearance (Themes + Backgrounds)
- Open **Settings** in the Chat tab to select a theme (Light, Dracula, One Dark, Nord, Catppuccin).
- Upload an app background image (stored locally in browser storage).
- Choose an **Avatar background** (animated GIF + MP4 loops under `apps/web/public/assets/aika/backgrounds/`, including a 30-video Pixabay fantasy pack).
- Credits for bundled backgrounds live in `docs/AVATAR_BACKGROUNDS.md`.

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

### Telegram (chat + remote commands)
Setup:
- `TELEGRAM_BOT_TOKEN` (required)
- `TELEGRAM_WEBHOOK_SECRET` (optional; verifies inbound webhooks)
- `TELEGRAM_CHAT_ID` (optional; used by outbound monitors/alerts)
- `THREAD_HISTORY_MAX_MESSAGES` (optional; caps per-thread memory window)

Inbound webhook:
- `POST /api/integrations/telegram/webhook` (Telegram sends updates here)
- First-time senders must pair; Aika replies with a pairing code. Approve it in the UI under Connections/Pairings.

Threaded memory (per chat):
- Each Telegram chat runs inside a persistent thread stored locally in SQLite.
- Aika includes recent thread turns in the prompt for continuity.
- Start/reset: `/thread new`
- Stop a thread: `/thread stop` (next message starts a new clean thread)
- Status: `/thread status`

RAG controls (per thread):
- `/rag list` to see available models (plus special `auto`, `all`)
- `/rag use <id|all|auto>` to set the thread's RAG model
- `/rag status` to view current selection
- If RAG returns no evidence or says "I don't know" Aika falls back to the LLM.

Remote command highlights:
- `/help` to list all commands
- `/status`, `/resources`, `/approvals`, `/approve <id> [token]`
- `/rss` and `/knowledge` to manage trading sources
- `/macro list` and `/macro run <id>`

Outbound send (requires approval by policy):
- `POST /api/integrations/telegram/send` `{ chatId, text }`


## Safety & Guardrails
MyAika includes a Safety & Autonomy Guardrails layer that enforces deny-by-default, least privilege, approvals for high-risk actions, and a tamper-evident audit log.

Key behaviors:
- Any action not explicitly allowlisted is blocked.
- High-risk actions (email sending, file delete, system changes, external posts) require approval.
- Kill switch (“Aika, stand down.”) halts automation immediately until disabled with approval.
- Audit logs are hash-chained and verifiable.

Policy config:
- File: `config/policy.json`
- Safe defaults are enforced; edit via the Safety tab or by hand when the server is stopped.

How to add a new action type:
1) Add the action type to `allow_actions` in `config/policy.json`.
2) Add to `requires_approval` if it is risky.
3) Update any domain allowlist or protected paths if needed.

Approvals:
- Pending approvals can be reviewed in the Safety tab.
- Approvals require an authenticated session or `ADMIN_APPROVAL_TOKEN`.

Audit verification:
- `GET /api/audit/verify` validates the hash chain.

### Google Docs + Drive
1) Create an OAuth client in Google Cloud Console and set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (example: `http://localhost:8790/api/integrations/google/callback`)
   - Optional: `GOOGLE_REDIRECT_URI_LOCAL` for localhost callbacks
   - Optional: `GOOGLE_REDIRECT_URIS` (comma-separated list of allowed callbacks)
   - `WEB_UI_URL` (example: `http://localhost:3000`)
2) Click "Connect" for Google Docs/Drive in the Integrations tab to complete OAuth.
3) Use these endpoints:
   - `GET /api/integrations/google/status`
   - `POST /api/integrations/google/disconnect`
   - `POST /api/integrations/google/docs/create` `{ title, content }`
   - `POST /api/integrations/google/docs/append` `{ documentId, content }`
   - `GET /api/integrations/google/docs/get?docId=...`
   - `POST /api/integrations/google/drive/upload` `{ name, content, mimeType }`
   - `GET /api/integrations/google/drive/list?limit=20`
   - `GET /api/integrations/google/sheets/get?spreadsheetId=...&range=Sheet1!A1:B5`
   - `POST /api/integrations/google/sheets/append` `{ spreadsheetId, range, values }`
   - `GET /api/integrations/google/calendar/next?max=10`
   - `POST /api/integrations/google/calendar/create` `{ summary, startISO, endISO, description?, location? }`
   - `GET /api/integrations/google/slides/get?presentationId=...`
   - `GET /api/integrations/google/meet/spaces`
   - `POST /api/integrations/google/meet/spaces`

Smoke test (PowerShell):
- `scripts/google_smoke_test.ps1` (optionally set `GOOGLE_SMOKE_DOC_ID`)

Docs: Google Docs API and Drive API. citeturn0search0turn0search1

### Fireflies.ai
Set `FIREFLIES_API_KEY` and restart the server, then call:
- `GET /api/integrations/fireflies/transcripts?limit=5`
- `GET /api/integrations/fireflies/transcripts/:id`
- `POST /api/integrations/fireflies/upload` `{ url, title, webhook, language }`

Fireflies GraphQL API docs. citeturn0search2

### Fireflies RAG (Local)
Local-only RAG is available for Fireflies transcripts using SQLite + sqlite-vec.

Setup:
- Set `FIREFLIES_API_KEY`
- Set `RAG_EMBEDDINGS_PROVIDER=local`
- Optional: `FIREFLIES_SYNC_INTERVAL_MINUTES` and `FIREFLIES_SYNC_ON_STARTUP=1` for auto-sync
- Optional: `FIREFLIES_AUTO_EMAIL=1` and `FIREFLIES_EMAIL_TO=you@example.com` for email summaries
- Optional: `FIREFLIES_EMAIL_BLOCKLIST=blocked@example.com` to suppress recipients

Manual sync + ask:
- `POST /api/fireflies/sync` `{ limit?: number, force?: boolean }`
- `POST /api/rag/ask` `{ question: string, topK?: number }`
- UI: open `http://localhost:3000/fireflies-rag`

### Action Runner + Teach Mode
Action Runner provides a DLAM-style browser executor with approvals and local artifacts.
- UI tabs: **Action Runner** and **Teach Mode**
- Endpoints:
  - `POST /api/action/plan`
  - `POST /api/action/run`
  - `GET /api/action/runs/:id`
- Macros:
  - `GET /api/teach/macros`
  - `POST /api/teach/macros`
  - `POST /api/teach/macros/:id/run`
- Artifacts saved under `data/action_runs/<runId>/`

### Connections Portal + Pairing
Use **Features → Connections** to see integration status, revoke tokens, and approve pairings.
- Pairing endpoints:
  - `GET /api/pairings`
  - `POST /api/pairings/:id/approve`
 - Inbound webhooks:
   - Telegram: `POST /api/integrations/telegram/webhook`
   - Slack events: `POST /api/integrations/slack/events`
   - Discord: set `DISCORD_BOT_TOKEN` to enable the gateway listener

### Live Canvas
Canvas cards are stored locally and rendered in the **Canvas** tab.
- `POST /api/canvas/update` `{ workspaceId, cardId, content, kind }`

### Skill Vault (Local)
Local-only skill registry for prompt skills.
- `GET /api/skill-vault`
- `POST /api/skill-vault/:id/run`

### Weather + Web Search (chat-enabled)
Aika can now use live internet helpers directly from chat:
- Weather examples:
  - `what is the weather in Seattle`
  - `forecast in Dallas`
  - Set once, then ask without city:
    - `my city is Tampa, FL`
    - `what is the weather`
- Web search examples:
  - `search web for best noise canceling headphones`
  - `look up latest NASA news`

Endpoints:
- `GET /api/integrations/weather/current?location=Seattle`
- `GET /api/integrations/web/search?q=latest%20nasa%20news&limit=5`

Optional env:
- `DEFAULT_WEATHER_LOCATION` (used when a weather prompt has no location)

### Persistent chat memory quick commands
- Save an explicit memory:
  - `remember that Jeff prefers concise summaries`
- Save location memory:
  - `my city is Seattle, WA`
- Recall:
  - `what do you remember about Jeff`

### Product Decision Agent (Amazon research)
Aika can run product research and return a recommendation popup with compared options.

Chat prompts:
- `find best price for wireless gaming mouse`
- `research best budget laptop stand`
- `compare prices for air purifier`

API:
- `POST /api/integrations/amazon/research` `{ query, budget?, limit? }`
- `POST /api/integrations/amazon/cart/add` `{ asin, quantity }` (prepares add-to-cart URL)

Notes:
- If Amazon Product Advertising keys are configured, Aika uses live Amazon listings.
- If not configured, Aika still returns a research panel from web sources.
- Cart behavior is add-to-cart only (no purchase flow).

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

## Signals Ingestion
Daily signals ingestion for market, energy, weather, and supply chain sources.
- Configure sources, reliability scores, and freshness thresholds in `config/signals_sources.json`.
- Manual run: `npm run ingest:signals`.
- UI monitor: open `/signals` in the web app for run status, trends, and documents.
- Run reports and logs: `data/signals/runs/` and `data/signals/logs/`.

Environment variables:
- `SIGNALS_CONFIG_PATH` (optional override for config path)
- `SIGNALS_INGEST_TIME` (default `06:15`)
- `SIGNALS_TIMEZONE` (default `America/New_York`)
- `SIGNALS_INGEST_ON_STARTUP` (set `1` to run on startup)
- `NASA_FIRMS_MAP_KEY` (optional, enables NASA FIRMS wildfire adapter)
- `SIGNALS_SIMHASH_DISTANCE` (near-duplicate threshold, default 3)
- `SIGNALS_DEDUP_LOOKBACK_HOURS` (default 96)
- `SIGNALS_MAX_RECENT_DEDUP` (default 1500)

## Restaurant RAG Pipeline (Location-aware)
Discovers restaurants via OpenStreetMap (Overpass), enriches from each official website, and ingests structured content into RAG.

How to run locally:
1) Ensure server deps are installed: `npm install`
2) Run the pipeline: `npm run durham:sync`

Optional CLI args:
- `--limit 50` (cap restaurant count)
- `--max-pages 12` (cap pages per restaurant)
- `--collection durham-restaurants` (override RAG collection id)
- `--overpass https://overpass-api.de/api/interpreter`
- `--amenity restaurant` (repeat to add amenities: `cafe`, `fast_food`, `pub`)
- `--location "Austin, TX"` (auto-geocode)
- `--zip 27701` (auto-geocode by postal code)
- `--city Durham --state NC`
- `--lat 35.99 --lon -78.90 --radius-km 15` (use a radius-based bbox)
- `--bbox 35.9,-79.1,36.1,-78.7` (explicit bbox: south,west,north,east)

Environment variables:
- `RESTAURANT_RAG_COLLECTION_ID` (optional override)
- `RESTAURANT_DEFAULT_LOCATION` (fallback if no location args provided; otherwise uses stored “my city is …” memory or `DEFAULT_WEATHER_LOCATION`)
- `RESTAURANT_RADIUS_KM` (default 15)
- `RESTAURANT_MAX_RESTAURANTS` (default 120)
- `RESTAURANT_MAX_PAGES` (default 20)
- `RESTAURANT_CRAWL_CONCURRENCY` (default 6)
- `RESTAURANT_CRAWL_PER_DOMAIN` (default 2)
- `RESTAURANT_CRAWL_DELAY_MS` (default 800)
- `RESTAURANT_USER_AGENT` (default `AikaDurham/1.0`)

Scheduling:
- Windows Task Scheduler: create a daily task that runs `npm run durham:sync` from the repo root.
- macOS/Linux cron: add `npm run durham:sync` on your preferred interval.

Example restaurant record:
```json
{
  "restaurant_id": "durham_3a1f9c2d1e12a9b8",
  "name": "Toro Pizzeria",
  "address": "123 Main St, Durham, NC 27701",
  "lat": 35.999,
  "lon": -78.901,
  "phone": "+19195550101",
  "website": "https://toropizzeria.example/",
  "cuisine_tags": ["Italian", "Pizza"],
  "hours": ["Monday 11:00-22:00", "Tuesday 11:00-22:00"],
  "price_hint": "$$",
  "source_refs": [
    "https://www.openstreetmap.org/node/123",
    "https://toropizzeria.example/"
  ]
}
```

Example RAG chunk metadata:
```json
{
  "restaurant_id": "durham_3a1f9c2d1e12a9b8",
  "restaurant_name": "Toro Pizzeria",
  "source_url": "https://toropizzeria.example/menu",
  "doc_type": "menu",
  "last_updated": "2026-02-21T18:12:10.000Z",
  "city": "Durham",
  "state": "NC",
  "postal_code": "27701",
  "location_label": "Durham, North Carolina, United States",
  "crawl_run_id": "a2c6cfea-acde-4cd3-8f3c-2f1b1b9c5e9a"
}
```

See `docs/QA_CHECKLIST.md` for validation steps.
