# Shell Capability + Approval Surfacing Phase 3

Date: 2026-04-17

## Goal

Surface assistant readiness and approval-required actions directly in the main `Chat` shell instead of hiding them in `Settings`, `Tools`, or individual chat messages.

## Delivered

- Added an `Assistant Shell` panel on the main chat page.
- Added an `Approval Queue` panel on the main chat page.
- Reused existing approval endpoints and approval handlers instead of creating a second workflow.
- Reused existing `Settings -> Connections` and `Settings -> Voice` flows from the new shell panel.

## Files

- Frontend page:
  - `apps/web/pages/index.jsx`
- Frontend helpers:
  - `apps/web/src/assistantShellStatus.js`
  - `apps/web/src/assistantShellStatus.test.js`

## Assistant Shell Behavior

The shell now reports these capability groups:

- Voice
- Email
- Calendar
- Weather
- Search
- Telegram
- WhatsApp
- SMS

Each item reports:

- `Ready` when it is currently usable
- `Setup` when user action or connector setup is still required

Current readiness is derived from:

- `GET /api/status`
- `GET /api/integrations`

## Approval Queue Behavior

The shell now shows actionable approvals directly on the chat page.

Queue items include:

- tool name
- risk level
- human summary
- approval reason

Available inline actions:

- `Approve`
- `Deny`
- `Execute` for already-approved items

The shell queue is kept in sync with:

- `GET /api/approvals`
- chat approval cards
- tool approval state

## Verification

### Tests

- `node --test apps/web/src/assistantShellStatus.test.js apps/web/src/avatar/lenoreConversationStates.test.js apps/web/src/avatar/lenoreFacialPerformance.test.js`
- `npm run build -w apps/web`

### Browser QA

Verified on the live page:

- `http://127.0.0.1:3412/`

Confirmed:

- main shell panel renders on `Chat`
- capability cards render with correct ready/setup state
- approval queue renders with live items from `/api/approvals`
- `Manage` opens `Settings -> Connections`

Artifacts:

- `output/playwright/assistant-shell-phase3/chat-shell.png`
- `output/playwright/assistant-shell-phase3/chat-shell.yml`
- `output/playwright/assistant-shell-phase3/settings-connections.png`

## Notes

- During QA, the frontend process on `3412` was serving stale `_next` assets. That was corrected by restarting the built frontend from the correct app root before final browser verification.
- Execution approval endpoints were already verified in Phase 2. This phase focused on shell surfacing and live-page visibility.
