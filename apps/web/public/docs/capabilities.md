# Capabilities Inventory
Generated: 2026-02-20

## Repo Map (High Level)
| Area | Purpose | Path(s) |
| --- | --- | --- |
| Web UI | Next.js app, pages router, React components | apps/web/pages, apps/web/src/components, apps/web/components |
| Backend API | Express server, REST endpoints, chat pipeline | apps/server/index.js |
| Agent + Planning | Multi-agent planner, model router | apps/server/src/agent, apps/server/src/actionRunner/planner.js, apps/server/src/desktopRunner/planner.js |
| Tooling (MCP-lite) | Tool registry and executor | apps/server/mcp/index.js, apps/server/mcp/tools |
| RAG | Vector store, ingestion, routing | apps/server/src/rag, apps/server/data/aika_rag.sqlite |
| Storage | SQLite DB + JSON stores | apps/server/storage, data/db/aika.sqlite, data/*.json |
| Integrations | OAuth + messaging + connectors | apps/server/integrations, apps/server/src/connectors |
| Trading Service | External trading API used by UI | aika-trading-assistant (Python service) |
| TTS Services | GPT-SoVITS and local TTS helpers | gptsovits_service, tts_service |
| Scripts | Dev utilities, smoke tests, RAG tools | scripts, apps/server/scripts |

## UI Entry Points (Next.js Pages)
| Route | UI Surface | Primary Files | Backend/API |
| --- | --- | --- | --- |
| / | Main multi-tab app | apps/web/pages/index.jsx, apps/web/src/components/*.jsx | apps/server/index.js |
| /signals | Signals monitor | apps/web/pages/signals.jsx, apps/web/src/components/SignalsPanel.jsx | /api/signals/* |
| /fireflies-rag | Fireflies RAG quick page | apps/web/pages/fireflies-rag.jsx | /api/fireflies/sync, /api/rag/ask, /api/feedback |
| /email | Email workspace | apps/web/pages/email.jsx | /api/email/*, /api/connectors/gmail/sync, /api/rag/ask, /api/tools/call |
| /trading | Trading full screen | apps/web/pages/trading.jsx, apps/web/src/components/TradingPanel.jsx | /api/trading/*, /api/market/candles |
| /telegram-call | Duplex voice call | apps/web/pages/telegram-call.jsx | /api/call/start, /api/call/stop, /chat, /api/stt/transcribe, /api/aika/voice/inline |
| /avatar-demo | Avatar demo | apps/web/pages/avatar-demo.tsx, apps/web/components/Avatar.jsx | /api/aika/avatar/* |

## Main App Tabs and User-Facing Capabilities
### Chat (Tab: chat)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Text chat (send and receive) | apps/web/pages/index.jsx | POST /chat in apps/server/index.js |
| Voice input (STT with silence detection) | apps/web/pages/index.jsx | POST /api/stt/transcribe in apps/server/index.js |
| Voice output (TTS playback) | apps/web/pages/index.jsx | POST /api/aika/voice/inline in apps/server/index.js |
| Feedback (thumbs up/down) | apps/web/pages/index.jsx | POST /api/feedback in apps/server/index.js |
| RAG citations display | apps/web/pages/index.jsx | /chat response includes citations from apps/server/src/rag/router.js |
| Avatar + mic status UI | apps/web/pages/index.jsx | /api/aika/avatar/models, /api/aika/tts/health |

### Recordings (Tab: recordings)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Start recording | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/start |
| Upload chunks | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/chunk |
| Finalize audio | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/final |
| Pause/Resume | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/pause, /resume |
| Stop recording | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/stop |
| Library list | apps/web/src/components/MeetingCopilot.jsx | GET /api/recordings |
| Recording detail | apps/web/src/components/MeetingCopilot.jsx | GET /api/recordings/:id |
| Ask about a recording | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/ask |
| Ask memory (all meetings) | apps/web/src/components/MeetingCopilot.jsx | POST /api/memory/ask |
| Update tasks | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/tasks |
| Run actions | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/actions |
| Resummarize | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/resummarize |
| Export transcript/notes | apps/web/src/components/MeetingCopilot.jsx | GET /api/recordings/:id/transcript, /notes, /export |
| Email recap | apps/web/src/components/MeetingCopilot.jsx | POST /api/recordings/:id/email |
| Delete recording | apps/web/src/components/MeetingCopilot.jsx | DELETE /api/recordings/:id |

### Aika Tools (Settings -> Legacy)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Meeting summary tool | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tool meeting.summarize via POST /api/tools/call |
| Notes create/search | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tools notes.create, notes.search |
| Todo lists and tasks | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tools todos.createList, todos.listLists, todos.create, todos.list, todos.update, todos.complete |
| Calendar holds | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tool calendar.proposeHold |
| Email drafts | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tool email.draftReply |
| Email send (approval) | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tool email.send |
| Email action layer (todo/follow-up/context send) | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tools email.convertToTodo, email.scheduleFollowUp, email.replyWithContext, email.sendWithContext |
| Email inbox preview | apps/web/src/components/AikaToolsWorkbench.jsx | GET /api/email/inbox |
| Email context (RAG) | apps/web/src/components/AikaToolsWorkbench.jsx | POST /api/rag/ask |
| Email connector sync (Gmail/Outlook) | apps/web/src/components/AikaToolsWorkbench.jsx | POST /api/connectors/gmail/sync, /api/connectors/outlook/sync |
| Email rules (run/preview/templates) | apps/web/src/components/AikaToolsWorkbench.jsx | /api/email/rules/* |
| Todo reminder delivery | apps/web/src/components/AikaToolsWorkbench.jsx | /api/todos/reminders/* |
| Spreadsheet updates | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tool spreadsheet.applyChanges |
| Memory write/search | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tools memory.write, memory.search |
| Integrations status | apps/web/src/components/AikaToolsWorkbench.jsx | GET /api/integrations, /api/integrations/google/status, /api/integrations/microsoft/status |
| Messaging (Slack/Telegram/Discord) | apps/web/src/components/AikaToolsWorkbench.jsx | MCP tools messaging.slackPost, messaging.telegramSend, messaging.discordSend |

### Tools (Tab: tools)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Tool list + schemas | apps/web/pages/index.jsx | GET /api/tools, /api/tools/:name |
| Run tool with JSON | apps/web/pages/index.jsx | POST /api/tools/call |
| Tool history | apps/web/pages/index.jsx | GET /api/tools/history |
| Approvals list/approve/deny/execute | apps/web/pages/index.jsx | /api/approvals/* |

### Action Runner (Tab: actionRunner)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Browser plan | apps/web/src/components/ActionRunnerPanel.jsx | POST /api/action/plan |
| Browser run | apps/web/src/components/ActionRunnerPanel.jsx | POST /api/action/run |
| Run status + artifacts | apps/web/src/components/ActionRunnerPanel.jsx | GET /api/action/runs/:id, /artifacts/:file |
| Desktop plan/run | apps/web/src/components/ActionRunnerPanel.jsx | POST /api/desktop/plan, /api/desktop/run |
| Desktop run stop/continue | apps/web/src/components/ActionRunnerPanel.jsx | POST /api/desktop/runs/:id/stop, /continue |
| Desktop artifacts | apps/web/src/components/ActionRunnerPanel.jsx | GET /api/desktop/runs/:id/artifacts/:file |
| Desktop macro record | apps/web/src/components/ActionRunnerPanel.jsx | POST /api/desktop/record |
| Desktop macros list/run/delete | apps/web/src/components/ActionRunnerPanel.jsx | /api/desktop/macros* |

### Teach Mode (Tab: teachMode)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Macro list | apps/web/src/components/TeachModePanel.jsx | GET /api/teach/macros |
| Save macro | apps/web/src/components/TeachModePanel.jsx | POST /api/teach/macros |
| Run macro | apps/web/src/components/TeachModePanel.jsx | POST /api/teach/macros/:id/run |
| Delete macro | apps/web/src/components/TeachModePanel.jsx | DELETE /api/teach/macros/:id |
| Approvals flow | apps/web/src/components/TeachModePanel.jsx | /api/approvals/* |

### Fireflies (Tab: fireflies)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Sync Fireflies | apps/web/src/components/FirefliesPanel.jsx | POST /api/fireflies/sync |
| Sync status | apps/web/src/components/FirefliesPanel.jsx | GET /api/fireflies/sync/status |
| Ask across meetings (RAG) | apps/web/src/components/FirefliesPanel.jsx | POST /api/rag/ask |
| RAG status | apps/web/src/components/FirefliesPanel.jsx | GET /api/rag/status |
| Meeting list | apps/web/src/components/FirefliesPanel.jsx | GET /api/rag/meetings |
| Knowledge graph | apps/web/src/components/FirefliesPanel.jsx | GET /api/fireflies/graph |
| Node details | apps/web/src/components/FirefliesPanel.jsx | GET /api/fireflies/node |

### Trading (Tab: trading)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Market candles + stream | apps/web/src/components/TradingPanel.jsx | GET /api/market/candles, GET /api/trading/stream |
| Trading recommendations | apps/web/src/components/TradingPanel.jsx | POST /api/trading/recommendations, /detail |
| Manual trade tracker | apps/web/src/components/TradingPanel.jsx | /api/trading/manual-trades (GET/POST/PATCH/DELETE) |
| Post-trade outcome | apps/web/src/components/TradingPanel.jsx | POST /api/trading/outcome |
| Trading settings | apps/web/src/components/TradingPanel.jsx | GET/POST /api/trading/settings |
| Symbols search | apps/web/src/components/TradingPanel.jsx | GET /api/trading/symbols/search |
| Knowledge RAG (ask) | apps/web/src/components/TradingPanel.jsx | POST /api/trading/knowledge/ask, /ask-deep, /api/rag/ask |
| Knowledge library + stats | apps/web/src/components/TradingPanel.jsx | GET /api/trading/knowledge/list, /stats |
| Knowledge ingest (text/url/file) | apps/web/src/components/TradingPanel.jsx | POST /api/trading/knowledge/ingest, /ingest-url, /upload |
| Knowledge sources (manage/crawl) | apps/web/src/components/TradingPanel.jsx | /api/trading/knowledge/sources*, /api/trading/knowledge/crawl |
| RSS sources (manage/crawl/seed) | apps/web/src/components/TradingPanel.jsx | /api/trading/rss/sources*, /api/trading/rss/crawl, /api/trading/rss/seed |
| Scenario runner + history | apps/web/src/components/TradingPanel.jsx | /api/trading/scenarios/run, /api/trading/scenarios, /api/trading/scenarios/detail |
| Daily picks | apps/web/src/components/TradingPanel.jsx | /api/trading/daily-picks/preview, /api/trading/daily-picks/run |
| External trading engine (order ticket, paper, backtest, options) | apps/web/src/components/TradingPanel.jsx | tradeApiUrl (default http://localhost:8088) used for /trades/*, /core/* endpoints in aika-trading-assistant |

### Safety (Tab: safety)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| View/update safety policy | apps/web/src/components/SafetyPanel.jsx | GET/POST /api/safety/policy (config/policy.json) |
| Approvals list/decision | apps/web/src/components/SafetyPanel.jsx | /api/approvals/* |
| Audit log | apps/web/src/components/SafetyPanel.jsx | GET /api/audit |
| Kill switch | apps/web/src/components/SafetyPanel.jsx | GET/POST /api/safety/kill-switch (data/runtime_flags.json) |

### Canvas (Tab: canvas)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Live cards feed | apps/web/src/components/CanvasPanel.jsx | GET /api/canvas |

### Features (Tab: features)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Connections list | apps/web/src/components/ConnectionsPanel.jsx | GET /api/connections |
| Pairing approvals | apps/web/src/components/ConnectionsPanel.jsx | GET /api/pairings, POST /api/pairings/:id/approve, /deny |
| Panic revoke | apps/web/src/components/ConnectionsPanel.jsx | POST /api/connections/panic, /api/connections/:id/revoke |

### Settings (Tab: settings)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Integrations connect/disconnect | apps/web/pages/index.jsx | /api/integrations/*, data/integrations.json |
| Skills toggle + exports | apps/web/pages/index.jsx | /api/skills, /api/skills/toggle, /api/skills/export/* |
| Knowledge defaults + model transfer | apps/web/pages/index.jsx | /api/rag/models, /api/rag/models/export, /api/rag/models/import, /api/rag/backup/download |
| Webhooks and scenes | apps/web/pages/index.jsx | /api/skills/webhooks, /api/skills/scenes |
| Skill vault run | apps/web/pages/index.jsx | /api/skill-vault, /api/skill-vault/:id/run |
| Trading email settings | apps/web/pages/index.jsx | /api/trading/settings (data/db/aika.sqlite) |
| Appearance (theme/background/avatar) | apps/web/pages/index.jsx | localStorage (aika_theme, aika_app_bg, aika_avatar_bg, aika_avatar_model) |
| Voice controls and preferences | apps/web/pages/index.jsx | /api/aika/voice/preference, /api/aika/voice/prompt, /api/aika/voices |

### Debug (Tab: debug)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Server status | apps/web/pages/index.jsx | GET /api/status |
| TTS health + diagnostics | apps/web/pages/index.jsx | GET /api/aika/tts/health, /api/aika/tts/diagnostics |
| Voice full test | apps/web/pages/index.jsx | GET/POST /api/voice/fulltest |
| Logs view | apps/web/pages/index.jsx | GET /api/status (includes recent logs) |

### Guide (Tab: guide)
| Capability | UI | Backend/Storage |
| --- | --- | --- |
| Render USER_GUIDE.md | apps/web/src/components/GuidePanel.jsx | /docs/USER_GUIDE.md |

## Backend Services and APIs (Selected Groups)
| Area | Endpoints | Source |
| --- | --- | --- |
| Chat + Voice | /chat, /api/call/start, /api/call/stop, /api/aika/voice*, /api/stt/transcribe | apps/server/index.js |
| Recordings | /api/recordings* | apps/server/index.js, apps/server/recordings |
| RAG | /api/rag/ask, /api/rag/status, /api/rag/models, /api/rag/models/export, /api/rag/models/import, /api/rag/backup/download, /api/rag/meetings | apps/server/index.js, apps/server/src/rag |
| Fireflies | /api/fireflies/sync*, /api/fireflies/graph, /api/fireflies/node | apps/server/index.js, apps/server/src/rag/firefliesIngest.js |
| Trading | /api/trading/*, /api/market/candles | apps/server/index.js, apps/server/src/trading |
| Signals | /api/signals/* | apps/server/index.js, apps/server/src/signals |
| Action/Teach/Desk | /api/action/*, /api/desktop/*, /api/teach/* | apps/server/index.js, apps/server/src/actionRunner, apps/server/src/desktopRunner |
| MCP Tools | /api/tools*, /api/approvals* | apps/server/index.js, apps/server/mcp |
| Safety/Audit | /api/safety/*, /api/audit* | apps/server/index.js, apps/server/src/safety |
| Skills | /api/skills*, /api/skill-vault* | apps/server/index.js, apps/server/skills, apps/server/src/skillVault |
| Workers/Plugins | /api/workers/*, /api/plugins* | apps/server/index.js, apps/server/src/workers, apps/server/src/plugins |
| Integrations/Connectors | /api/integrations/*, /api/connectors/*, /api/email/* | apps/server/index.js, apps/server/integrations, apps/server/src/connectors, apps/server/src/email |

## Agent Architecture (Chat + Tools)
| Component | Role | Files |
| --- | --- | --- |
| Chat pipeline | Parses memory commands, RAG routing, product research, weather, web search, Fireflies summary, skills | apps/server/index.js (POST /chat) |
| Skills parser | Lightweight local skills for notes/todos/shopping/reminders/etc | apps/server/skills/index.js |
| Tool executor | MCP tool registry + approvals + audit | apps/server/mcp/index.js, apps/server/mcp/executor.js |
| Action planning | Multi-agent planning for browser/desktop runs | apps/server/src/agent/multiAgent.js, apps/server/src/actionRunner/planner.js, apps/server/src/desktopRunner/planner.js |
| Safety + approvals | Risk scoring, approvals, kill switch | apps/server/src/safety |
| Remote commands | Telegram/Slack command parsing and tool calls | apps/server/integrations/remoteCommands.js |

## RAG Systems Inventory
| RAG Area | Purpose | Files/Storage |
| --- | --- | --- |
| Vector store + FTS | Hybrid vector + lexical search | apps/server/src/rag/vectorStore.js, apps/server/src/rag/hybrid.js, apps/server/data/aika_rag.sqlite |
| Routing | Heuristic + meta routing | apps/server/src/rag/router.js, apps/server/src/rag/metaRag.js |
| Ingestion | Fireflies, recordings, notes, todos, memory, feedback | apps/server/src/rag/firefliesIngest.js, recordingsIngest.js, notesIngest.js, todosIngest.js, memoryIngest.js, apps/server/src/feedback/feedback.js |
| Connectors ingestion | Email/docs/chat/tickets into RAG collections | apps/server/src/connectors/*.js, apps/server/src/connectors/ingest.js |
| Collections | Built-in trading and fireflies + custom | apps/server/src/rag/collections.js |
| Eval harness | Golden queries and report | apps/server/src/rag/evalHarness.js, apps/server/evals/rag_golden.json |
| Trading knowledge RAG | Trading sources + RSS + YouTube + QA | apps/server/src/trading/knowledgeRag.js, rssIngest.js, youtubeIngest.js |

### RAG Collections and Prefixes
- `fireflies` (meetingType filter `fireflies`)
- `recordings` (meetingIdPrefix `recording:`)
- `memory` (meetingIdPrefix `memory:`)
- `feedback` (meetingIdPrefix `feedback:`)
- `signals` (meetingIdPrefix `signals:`)
- `trading` (meetingIdPrefix `trading:`)
- `notes` (meetingIdPrefix `rag:notes:`)
- `todos` (meetingIdPrefix `rag:todos:`)
- `gmail` (meetingIdPrefix `rag:gmail:`)
- `outlook` (meetingIdPrefix `rag:outlook:`)
- `slack` (meetingIdPrefix `rag:slack:`)
- `confluence` (meetingIdPrefix `rag:confluence:`)
- `notion` (meetingIdPrefix `rag:notion:`)
- `jira` (meetingIdPrefix `rag:jira:`)
- Custom collections (meetingIdPrefix `rag:<collection>:`)

## Telegram Integration
| Capability | Where | Files |
| --- | --- | --- |
| Webhook ingestion | POST /api/integrations/telegram/webhook | apps/server/index.js |
| Voice message STT | Telegram voice -> /api/stt/transcribe | apps/server/index.js, apps/server/integrations/messaging.js |
| Reply (text/voice) | executeAction with messaging.telegramSend/VoiceSend | apps/server/index.js, apps/server/integrations/messaging.js |
| Pairing flow | Pairing requests + approvals | apps/server/storage/pairings.js, apps/web/src/components/ConnectionsPanel.jsx |
| Remote commands | /help, /rag, /macro, /approve, /thread, /rss, /knowledge | apps/server/integrations/remoteCommands.js |
| Duplex call UI | /telegram-call page | apps/web/pages/telegram-call.jsx |

## Backend Tools and Scripts Aika Can Run
### MCP Tool Registry (callable via /api/tools/call and ToolExecutor)
| Tool | Files | Invocation |
| --- | --- | --- |
| meeting.summarize | apps/server/mcp/index.js, apps/server/mcp/tools/meeting.js | POST /api/tools/call |
| notes.create, notes.search | apps/server/mcp/index.js, apps/server/mcp/tools/notes.js | POST /api/tools/call |
| todos.createList, todos.listLists, todos.updateList | apps/server/mcp/index.js, apps/server/mcp/tools/todos.js | POST /api/tools/call |
| todos.create, todos.list, todos.update, todos.complete | apps/server/mcp/index.js, apps/server/mcp/tools/todos.js | POST /api/tools/call |
| calendar.proposeHold | apps/server/mcp/index.js, apps/server/mcp/tools/calendar.js | POST /api/tools/call |
| email.draftReply, email.send | apps/server/mcp/index.js, apps/server/mcp/tools/email.js | POST /api/tools/call |
| email.convertToTodo, email.scheduleFollowUp | apps/server/mcp/index.js, apps/server/mcp/tools/email.js | POST /api/tools/call |
| email.replyWithContext, email.sendWithContext | apps/server/mcp/index.js, apps/server/mcp/tools/email.js | POST /api/tools/call |
| spreadsheet.applyChanges | apps/server/mcp/index.js, apps/server/mcp/tools/spreadsheet.js | POST /api/tools/call |
| memory.write, memory.search, memory.rotateKey | apps/server/mcp/index.js, apps/server/mcp/tools/memory.js | POST /api/tools/call |
| integrations.plexIdentity, integrations.firefliesTranscripts | apps/server/mcp/index.js, apps/server/mcp/tools/integrations.js | POST /api/tools/call |
| weather.current, web.search | apps/server/mcp/index.js, apps/server/mcp/tools/integrations.js | POST /api/tools/call |
| shopping.productResearch, shopping.amazonAddToCart | apps/server/mcp/index.js, apps/server/mcp/tools/integrations.js | POST /api/tools/call |
| messaging.slackPost, messaging.telegramSend, messaging.discordSend | apps/server/mcp/index.js, apps/server/mcp/tools/integrations.js | POST /api/tools/call |
| system.modify | apps/server/mcp/index.js, apps/server/mcp/tools/system.js | POST /api/tools/call |
| action.run, desktop.run | apps/server/mcp/index.js, apps/server/mcp/tools/actionRunner.js, desktopRunner.js | POST /api/tools/call |
| skill.vault.run | apps/server/mcp/index.js, apps/server/mcp/tools/skillVault.js | POST /api/tools/call |

### Local Skills (chat-triggered)
| Skill | Storage | Trigger Path |
| --- | --- | --- |
| time_date | data/skills/config.json | /chat -> handleSkillMessage in apps/server/skills/index.js |
| notes | data/skills/notes.jsonl | /chat -> handleSkillMessage |
| todos | data/skills/todos.json | /chat -> handleSkillMessage |
| system_status | (none) | /chat -> handleSkillMessage |
| shopping | data/skills/shopping.json | /chat -> handleSkillMessage |
| reminders | data/skills/reminders.json | /chat -> handleSkillMessage |
| webhooks | data/skills/webhooks.json | /chat -> handleSkillMessage |
| scenes | data/skills/scenes.json | /chat -> handleSkillMessage |
| meeting helper | (none) | /chat -> handleSkillMessage (returns UI instructions only) |

### CLI/Scripts (invoked via npm scripts)
| Script | Command | Files |
| --- | --- | --- |
| RAG eval | npm run rag:eval | apps/server/scripts/rag_eval.js |
| RAG hybrid sample | npm run rag:sample | apps/server/scripts/rag_hybrid_sample.js |
| Rebuild RAG FTS | npm run rag:fts | apps/server/scripts/rebuild_rag_fts.js |
| RAG backup | npm run rag:backup | apps/server/scripts/backup_rag_drive.js |
| Memory retention | npm run memory:retention | apps/server/scripts/memory_retention.js |
| Desktop sample/record | npm run desktop:sample, desktop:record | apps/server/scripts/desktop_sample.js, desktop_record_sample.js |
| Voice/TTS smoke | npm run tts, voice:smoke, voice:test | apps/server/scripts/tts_sample.js, voice_smoke.js, voice_fulltest.js |
| Signals ingest | npm run ingest:signals | apps/server/scripts/signals_ingest.js |
| UI smoke tests | npm run smoke, ui:smoke | scripts/full_smoke_test.js, scripts/ui_smoke.js |

## Settings and Preferences Inventory
| Setting | Stored In | UI Surface | Files/Endpoints |
| --- | --- | --- | --- |
| Theme | localStorage:aika_theme | Settings -> Appearance | apps/web/pages/index.jsx |
| App background | localStorage:aika_app_bg | Settings -> Appearance | apps/web/pages/index.jsx |
| Avatar background | localStorage:aika_avatar_bg | Settings -> Appearance | apps/web/pages/index.jsx |
| Avatar model | localStorage:aika_avatar_model | Settings -> Appearance | apps/web/pages/index.jsx, /api/aika/avatar/models |
| Voice command listening | localStorage:aika_meeting_commands | Settings -> Appearance | apps/web/pages/index.jsx |
| STT silence threshold | localStorage:aika_stt_silence_ms | Settings -> Voice | apps/web/pages/index.jsx |
| Active RAG model (chat) | localStorage:aika_active_rag_model | Chat settings | apps/web/pages/index.jsx |
| TTS voice preference | Memory vault | Settings -> Voice | POST /api/aika/voice/preference |
| TTS prompt text | Memory vault | Settings -> Voice | POST /api/aika/voice/prompt |
| Default voice config | apps/server/aika_config.json | (not editable in UI) | GET /api/aika/config |
| Safety policy | config/policy.json | Safety tab | GET/POST /api/safety/policy |
| Kill switch | data/runtime_flags.json | Safety tab | GET/POST /api/safety/kill-switch |
| Integrations tokens | data/integrations.json (encrypted) | Settings -> Integrations | /api/integrations/* |
| Email rules config + templates | data/integrations.json | Settings -> Legacy -> Email Rules | /api/email/rules/* |
| Todo reminder settings | data/integrations.json | Settings -> Legacy -> Reminders | /api/todos/reminders/* |
| Trading settings | data/db/aika.sqlite | Settings -> Trading, Trading tab | /api/trading/settings |
| Skills enabled flags | data/skills/config.json | Settings -> Skills | /api/skills, /api/skills/toggle |
| Webhooks + scenes | data/skills/webhooks.json, data/skills/scenes.json | Settings -> Skills | /api/skills/webhooks, /api/skills/scenes |
| Skill vault | data/skills/vault/* | Settings -> Skills | /api/skill-vault* |
| Assistant profile | data/db/aika.sqlite | (not surfaced) | /api/assistant/profile |

## Gaps and Parity Issues (UI vs Chat vs Telegram)
- Chat does not invoke MCP tools (meeting summaries, notes, todos, calendar, email, spreadsheet, memory) even though UI does via /api/tools/call. Entry points: apps/server/index.js (POST /chat), apps/server/mcp/index.js, apps/web/src/components/AikaToolsWorkbench.jsx.
- Chat "record meeting" only returns UI guidance; it does not call /api/recordings/start or manage recording state. Entry points: apps/server/skills/index.js, apps/web/src/components/MeetingCopilot.jsx.
- Telegram remote commands cover status, RAG selection, macros, approvals, RSS/knowledge admin, but not most UI functions (recordings, tools, trading workflows, email workspace). Entry points: apps/server/integrations/remoteCommands.js.
- Tools tab features (tool list, tool execution) are UI-only; no natural-language chat router maps user requests to MCP tools yet. Entry points: apps/web/pages/index.jsx, apps/server/mcp/index.js.
- Trading UI actions (order ticket, paper/backtest/options) rely on external trading API and are not reachable from chat/Telegram. Entry points: apps/web/src/components/TradingPanel.jsx, aika-trading-assistant.
- Email workspace actions (triage, Gmail bulk actions) are UI-only. Entry points: apps/web/pages/email.jsx, apps/server/index.js (/api/email/*).
- Signals monitor can be triggered via /api/signals/run from UI only; chat has no intent mapping for signals. Entry points: apps/web/src/components/SignalsPanel.jsx, apps/server/src/signals.

## End of Phase 1
This file is the baseline inventory for phases 2-6. All changes should reference these paths or update this inventory.
