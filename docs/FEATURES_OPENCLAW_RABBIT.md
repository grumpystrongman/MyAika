# OpenClaw / RabbitOS Features (Local)

This document summarizes the OpenClaw / Rabbit R1-inspired features implemented in MyAika. All features are local-first and do not alter existing voice/TTS/STT behavior.

## Action Runner
- **What it is:** Headless browser action runner using Playwright.
- **Where:** UI tab **Action Runner**.
- **Data:** `data/action_runs/<runId>/` (screenshots + HTML snippets + run.json)
- **Endpoints:**
  - `POST /api/action/plan` `{ instruction, startUrl? }`
  - `POST /api/action/run` `{ taskName?, startUrl?, actions[], safety?, async? }`
  - `GET /api/action/runs/:id`
  - `GET /api/action/runs/:id/artifacts/:file`
- **Approvals:** Required for risky steps or new domains (see approvals tab).

## Desktop Runner
- **What it is:** Local Windows desktop control runner (mouse/keyboard/screenshot).
- **Where:** UI tab **Action Runner** → **Desktop** mode.
- **Data:** `data/desktop_runs/<runId>/` (screenshots + run.json)
- **Endpoints:**
  - `POST /api/desktop/plan` `{ instruction }`
  - `POST /api/desktop/run` `{ taskName?, actions[], safety?, async? }`
  - `GET /api/desktop/runs/:id`
  - `GET /api/desktop/runs/:id/artifacts/:file`
- **Approvals:** Always required.
- **Notes:** Requires an active, unlocked Windows desktop session.

## Desktop Macro Recorder
- **What it is:** Capture live mouse/keyboard input into reusable desktop macros.
- **Where:** UI tab **Action Runner** → **Desktop** mode → **Macro Recorder**.
- **Data:** `data/desktop_macros/*.json`
- **Endpoints:**
  - `POST /api/desktop/record` `{ options?, save?, name?, description?, tags?, safety? }`
  - `GET /api/desktop/macros`
  - `POST /api/desktop/macros`
  - `POST /api/desktop/macros/:id/run`
  - `DELETE /api/desktop/macros/:id`
- **Notes:** Recording stops on the configured stop key (default `F8`).

## Action Planner
- **What it is:** LLM planner that converts natural language to an action plan JSON.
- **Where:** Action Runner tab → “Preview Plan”.

## Teach Mode
- **What it is:** Save reusable browser macros with parameters.
- **Where:** UI tab **Teach Mode**.
- **Data:** `data/skills/macros/*.json`
- **Endpoints:**
  - `GET /api/teach/macros`
  - `POST /api/teach/macros`
  - `POST /api/teach/macros/:id/run`

## Connections Portal
- **What it is:** Consolidated view of integrations with statuses, scopes, and last used.
- **Where:** Features tab → **Connections** subpage.
- **Security:** Tokens are encrypted at rest using the local key in `secrets/memory_vault.key`.
- **Panic switch:** Disables outbound tools at runtime.

## Messaging Pairing (Telegram/Slack/Discord)
- **What it is:** Pairing approval flow for inbound chat channels.
- **Behavior:** Unknown senders receive a pairing code; messages are ignored until approved.
- **Where:** Features → Connections → Pairing Requests.

## Live Canvas
- **What it is:** Aika-updated cards for todos, summaries, and notes.
- **Where:** UI tab **Canvas**.
- **Endpoint:** `POST /api/canvas/update`.

## Skill Vault (local)
- **What it is:** Local-only skill registry for prompt skills and macros.
- **Data:** `data/skills/vault/<skillId>/manifest.json`
- **Endpoints:**
  - `GET /api/skill-vault`
  - `POST /api/skill-vault/:id/run`

## UI Notes (Click-through)
- Action Runner: open main UI → **Action Runner** tab.
- Desktop Runner: open main UI → **Action Runner** tab → **Desktop** mode.
- Desktop Macro Recorder: open **Action Runner** → **Desktop** mode → **Macro Recorder**.
- Teach Mode: main UI → **Teach Mode** tab → create/save a macro.
- Connections: main UI → **Features** → **Connections**.
- Canvas: main UI → **Canvas** tab to view cards.
- Skill Vault: **Settings → Skills** section.

## Notes
- Voice/TTS/STT settings and GPT-SoVITS/Piper configs are unchanged.
- For full checks, see `docs/QA_ACTION_RUNNER.md`.

## Minimal Demo Flow
1) Open **Action Runner** and generate a plan that goes to a public site and extracts text.
2) Run it; confirm screenshots appear in the timeline.
3) In **Teach Mode**, save the plan as a macro and re-run with a parameter.
4) In **Action Runner → Desktop**, record a short macro and save it.
5) Open **Canvas** and verify cards render after updates via `/api/canvas/update`.
