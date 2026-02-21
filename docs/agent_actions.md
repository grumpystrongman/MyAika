# Agent Actions (Intent → Plan → Execute → Report)
Generated: 2026-02-20

## Overview
Aika now routes explicit user intents into structured actions, executes them through a single internal action executor, and reports status back to the UI/Telegram.

The loop:
1) **Intent**: Parse user text into a structured intent/action.
2) **Plan**: Attach a short plan (implicit for now) + validate required params.
3) **Execute**: Run via MCP tools or internal handlers with idempotency and retries.
4) **Report**: Return status, approvals (if needed), and a user-friendly reply.

## Action Request Schema
Actions returned by the intent router follow this shape:
```json
{
  "id": "action-id",
  "type": "record_meeting.start",
  "params": { "title": "Sprint Review" },
  "missing": [],
  "status": "client_required",
  "idempotencyKey": "f3a9b0a4c2c8e3f1"
}
```

Key fields:
- `id`: unique action ID
- `type`: action type (see list below)
- `params`: action parameters
- `missing`: required parameters that are missing
- `status`: `needs_input` | `client_required` | `approval_required` | `ok` | `error`
- `idempotencyKey`: stable hash for retries/deduping

## Action Types Implemented
### Client actions (executed in UI)
- `record_meeting.start`
- `record_meeting.stop`
- `record_meeting.pause`
- `record_meeting.resume`

### Tool actions (MCP tools)
- `meeting.summarize` → `meeting.summarize`
- `todos.create` → `todos.create`
- `email.send` → `email.send`
- `messaging.slackPost` → `messaging.slackPost`
- `messaging.telegramSend` → `messaging.telegramSend`
- `messaging.discordSend` → `messaging.discordSend`

### Internal actions
- `meeting.export` → export notes/transcript/audio links
- `meeting.email` → email meeting notes (uses safety approval flow)
- `meeting.recap_doc` → create recap doc (Google Doc or local markdown)
- `meeting.draft_email` → draft recap email text
- `meeting.schedule_followup` → create follow-up event or draft
- `meeting.create_task` → draft task
- `meeting.create_ticket` → draft ticket
- `meeting.resummarize` → refresh meeting summary (async)
- `meeting.delete` → delete recording (approval required)
- `docs.get` → Google Docs fetch
- `rag.use` → set thread RAG model
- `rag.eval` → run RAG eval harness
- `rag.fts` → rebuild lexical FTS index
- `signals.run` → run signals ingestion
- `fireflies.sync` → start Fireflies sync

## Defaults
- Telegram send actions auto-fill `chatId` from the inbound chat context when omitted.

## Approval Model
Default behavior: the user’s message is approval for **safe actions**.

Safe actions list:
- `record_meeting.*`
- `meeting.summarize`
- `email.send` (self/work address only, autonomy-safe)
- `meeting.export`
- `meeting.recap_doc`
- `meeting.draft_email`
- `meeting.schedule_followup`
- `meeting.create_task`
- `meeting.create_ticket`
- `meeting.resummarize`
- `todos.create`
- `docs.get`
- `rag.use`
- `rag.eval`
- `rag.fts`
- `signals.run`
- `fireflies.sync`

Risky actions are delegated to MCP tools which enforce approvals via the safety policy (e.g., messaging).
If a tool returns `approval_required`, the assistant replies with an approval ID and the UI/Telegram must route the user to Approvals.

Autonomy exceptions:
- `email.send` bypasses approval only when the intent explicitly targets your saved work/personal email (e.g., "email my work address") and no CC/BCC is included. The action sets `params.autonomy = "self"` and is validated against your profile.

## Progress + Reporting
Each handled intent returns:
- `reply`: a user-facing summary
- `action`: the structured action object
- `actionResult`: raw execution result (if any)
- `approval`: approval payload (if required)

These are surfaced in the UI so the chat experience can display “Aika is doing it…” and trigger client actions (e.g., start recording).
Action run status is available via:
- `GET /api/actions/runs/:id` (poll)
- `GET /api/actions/runs/:id/stream` (SSE)
Telegram status check:
- `/action <id>` returns the latest run status.

## Examples
### Record Meeting
User: “Record this meeting”
- Intent: `record_meeting.start`
- Action: `record_meeting.start` (client_required)
- UI: auto-starts Meeting Copilot recording

### Create Task
User: “Add todo: Email the Q4 deck to Sarah”
- Intent: `todos.create`
- Action: `todos.create` → MCP tool
- Result: “Task created: Email the Q4 deck to Sarah”

### Send Message
User: “Send Slack #ops: Deploy complete”
- Intent: `messaging.slackPost`
- Action: MCP tool
- Result: `approval_required` (per policy)

### Send Email To Work Address
User: “Email my work address to remind me to submit payroll”
- Intent: `email.send`
- Action: MCP tool (autonomy-safe)
- Result: “Email sent to you@work.com.”

## Primary Files
- `apps/server/src/agent/intentRouter.js`
- `apps/server/src/agent/actionExecutor.js`
- `apps/server/src/agent/actionPipeline.js`
- `apps/server/src/agent/actionRunStore.js`
- `apps/server/index.js` (chat integration)
- `apps/web/pages/index.jsx` (client action handling)
