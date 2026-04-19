# Execution Orchestration Phase 2

## Goal

Route combined execution requests through the real approval-aware action system instead of:

- generic chat replies
- workflow module interception
- one-off integration endpoints

This phase covers combined requests for:

- `email.send`
- `calendar.proposeHold`
- `messaging.telegramSend`
- `messaging.whatsapp.send`
- `messaging.sms.send`

## What Changed

### 1. Combined execution router

Added:

- `apps/server/src/aika/executionCapabilityRouter.js`

This router:

- splits multi-action requests into executable clauses
- parses each clause through the existing intent router
- only activates when at least 2 execution actions are present
- executes each clause through `handleActionIntent(...)`
- returns one aggregated reply with per-action sections and approvals

### 2. Intent coverage expanded

Updated:

- `apps/server/src/agent/intentRouter.js`

Added parsing for:

- `calendar.proposeHold`
- `messaging.whatsapp.send`
- `messaging.sms.send`

Also fixed:

- trailing punctuation on extracted email addresses

### 3. Action executor coverage expanded

Updated:

- `apps/server/src/agent/actionExecutor.js`

Added first-class execution support for:

- `calendar.proposeHold` via MCP tool executor
- `messaging.whatsapp.send` via internal approval-aware execution
- `messaging.sms.send` via internal approval-aware execution

### 4. `/chat` route order corrected

Updated:

- `apps/server/index.js`

Execution orchestration now runs **before** `routeAikaCommand(...)`.

This prevents combined execution requests from being stolen by the workflow/module layer.

### 5. Calendar timezone completion

Updated:

- `apps/server/src/agent/actionPipeline.js`

`calendar.proposeHold` now inherits `context.timezone` when available so normal chat requests do not need to repeat it.

## Validation

### Tests

Run:

```powershell
$env:AIKA_TEST_MODE='1'
node --test apps/server/tests/execution_capability_router.test.js apps/server/tests/core_capability_router.test.js apps/server/tests/agent_actions.test.js apps/server/tests/affect_model.test.js
```

### Live checks

Verified against:

- `http://127.0.0.1:3512/chat`

Examples that now work as combined approval-aware execution requests:

```text
Email test@example.com: Quick status update and send telegram chat 12345: Ping me when done
```

```text
Create calendar hold "Review" tomorrow at 3pm for 30 minutes and text +15555550123: running five minutes late
```

Both now return:

- `orchestrated: true`
- per-action sections
- approval objects for each outbound or medium/high-risk action

## Boundary

This phase does **not** yet cover:

- mixed read + execute orchestration in one request
- fuzzy attendee extraction for calendar events
- contact alias resolution for SMS/WhatsApp phone numbers
- send-after-approval execution chaining from the chat surface

## Next Phase

Capability status and assistant shell integration:

- surface execution approvals and capability availability in the main UI
- make pending approvals visible from the conversation flow
- add explicit execution status feedback in the assistant shell
