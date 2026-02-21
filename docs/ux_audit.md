# UX Audit (Phase 2)
Generated: 2026-02-20

## Scope
Principal UX review across web UI, backend workflows, agent behavior, RAG routing, and Telegram parity. Focused on the primary journeys:
1) First run / onboarding
2) Ask Aika to do something (record meeting, summarize, create tasks, retrieve info)
3) Configure settings
4) Daily usage workflows
5) Cross-channel continuity (Web ↔ Telegram)

## Journey Review Summary
First run: The app gates on Google auth when enabled but does not guide setup beyond sign-in. After OAuth, users must manually refresh and discover configuration gaps (TTS, Fireflies, Telegram) themselves.

Ask Aika to do something: The chat experience feels conversational, but most UI actions (meeting recording, notes/todos, email actions) are not executable from chat. “Record meeting” returns UI instructions instead of starting the recorder.

Configure settings: Integrations, approvals, and voice settings are spread across multiple screens. Several settings are stored in localStorage while others are server-side, which breaks continuity and cross-device consistency.

Daily usage: Many workflows expose raw JSON responses without clear next actions. Approvals are separated into different tabs, creating extra navigation for common tasks.

Cross-channel: Telegram messages largely route to /chat with no tool execution parity. Remote commands exist but cover a narrow subset and are not surfaced in the web UI.

## Prioritized Issues (P0/P1/P2)
| ID | Severity | Flow | Issue | Evidence (Paths) | Recommended Fix (Concrete Code Change) |
| --- | --- | --- | --- | --- | --- |
| P0-1 | P0 | Ask Aika to do something | Chat cannot execute core actions (e.g., “Record this meeting”). It returns UI guidance instead of starting a recording. | `apps/server/skills/index.js` (meeting helper), `apps/server/index.js` (/chat lacks tool routing), `apps/web/src/components/MeetingCopilot.jsx` (recording only via UI) | Add an intent router in `/chat` that maps “record meeting” to `POST /api/recordings/start` and maintains recording state. Implement tool execution in server (`apps/server/index.js` + new `apps/server/src/agent/intentRouter.js`) and surface progress events to UI/Telegram. |
| P0-2 | P0 | Cross-channel continuity | Telegram parity is broken. Inbound messages mostly call `/chat` and do not access UI capabilities; remote commands cover only a subset. | `apps/server/integrations/inbound.js`, `apps/server/integrations/remoteCommands.js` | Route Telegram (and other channels) through the same intent router and tool execution pipeline as web chat. Extend remote commands or replace them with intent-based actions. Add parity tests that assert Telegram and web route to the same action plan. |
| P1-1 | P1 | Configure settings | Integrations and connections are duplicated across Settings, Features/Connections, and the Aika Tools Workbench. Users must check multiple places for the same concept. | `apps/web/pages/index.jsx` (Settings Integrations), `apps/web/src/components/ConnectionsPanel.jsx`, `apps/web/src/components/AikaToolsWorkbench.jsx` (Integrations status) | Consolidate integrations into a single “Connections” surface and make other panels link to it. Remove or deprecate duplicate lists in Aika Tools Workbench. Normalize state to a single backend source (`/api/integrations` + `/api/connections`). |
| P1-2 | P1 | Configure settings | Voice settings are duplicated (Chat panel vs Settings) and stored in mixed locations (localStorage + memory vault). This is confusing and non-portable. | `apps/web/pages/index.jsx` (chat voice panel + Settings Voice), `apps/server/aika_config.json`, `apps/server/storage/assistant_profile.js` (unused by UI) | Move voice settings to a single Settings panel and store in `assistant_profile` via `/api/assistant/profile`. Deprecate localStorage for voice settings and hydrate UI from server profile. |
| P1-3 | P1 | Daily usage | Approvals are separated into Tools and Safety tabs. When a tool returns `approval_required`, the user must navigate away to approve. | `apps/web/pages/index.jsx` (Tools approvals list), `apps/web/src/components/SafetyPanel.jsx`, `apps/web/src/components/AikaToolsWorkbench.jsx` (tool results) | Add inline approval cards wherever tool calls are made (Workbench, Action Runner, Teach Mode). Provide approve/deny actions in-place and keep the global approvals list in one canonical tab. |
| P1-4 | P1 | Daily usage | RAG model selection is fragmented: Chat uses localStorage, Trading uses its own model selector, and Telegram uses thread-level `rag_model`. Users get inconsistent answers across channels. | `apps/web/pages/index.jsx` (localStorage `aika_active_rag_model`), `apps/web/src/components/TradingPanel.jsx`, `apps/server/storage/threads.js` | Centralize RAG selection to server state (thread-level or assistant profile). Remove localStorage for chat selection and set/consume `rag_model` via API. Reflect current selection in all UIs. |
| P1-5 | P1 | First run | OAuth sign-in requires manual refresh and does not provide a clear first-run checklist for core integrations (TTS, Fireflies, Telegram). | `apps/web/pages/index.jsx` (auth gate message “refresh this page”), `apps/server/index.js` (/api/status) | Add an onboarding panel that pulls `/api/status` and `/api/integrations` to show missing config. After OAuth, poll `/api/auth/me` and auto-unlock without manual refresh. |
| P1-6 | P1 | Cross-channel continuity | Email workflows are split between the Workbench and `/email` page; features are duplicated and discoverability is poor. | `apps/web/src/components/AikaToolsWorkbench.jsx`, `apps/web/pages/email.jsx` | Add a top-level Email tab or link from Workbench to `/email`. De-duplicate overlapping actions or embed the dedicated Email workspace inside the main tab. |
| P1-7 | P1 | Daily usage | Trading actions (order ticket, paper/backtest/options) rely on an external service URL that is configured ad hoc in the UI and not integrated into chat or settings. | `apps/web/src/components/TradingPanel.jsx` (`tradeApiUrl`), `aika-trading-assistant` | Add a server-side trading engine config endpoint and UI settings. Provide a health status card and wire chat/Telegram actions through a tool that calls the trading service. |
| P2-1 | P2 | Daily usage | Many tool responses are displayed as raw JSON, increasing cognitive load and hiding next steps. | `apps/web/src/components/AikaToolsWorkbench.jsx` (JSON result `<pre>` blocks) | Replace raw JSON with formatted “result cards” (status, key fields, next actions). Keep JSON behind an “Advanced” toggle. |
| P2-2 | P2 | Navigation | Fireflies exists as both a main tab and a separate `/fireflies-rag` page, creating a split mental model. | `apps/web/src/components/FirefliesPanel.jsx`, `apps/web/pages/fireflies-rag.jsx` | Redirect `/fireflies-rag` to the main Fireflies tab or embed it. Remove duplicate navigation references in the guide. |
| P2-3 | P2 | Settings | Appearance and behavior preferences live in localStorage only, so they do not persist across devices or users. | `apps/web/pages/index.jsx` (localStorage keys `aika_theme`, `aika_app_bg`, `aika_avatar_bg`, `aika_avatar_model`) | Migrate preferences to `assistant_profile` and sync to the server. Keep localStorage as a cache only. |

## Notes
No code changes were applied in Phase 2. All fixes are enumerated with concrete code targets for Phase 3+ implementation.
