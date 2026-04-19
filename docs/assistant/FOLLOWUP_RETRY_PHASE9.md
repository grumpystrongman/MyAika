# Follow-up and Retry Phase 9

## Scope
- Add server-side follow-up handling for short conversational commands after an action:
  - `retry that`
  - `did that send?`
  - `go ahead`

## Implemented
- Added `apps/server/src/aika/actionFollowUpRouter.js`
- Added `listRecentAgentActionsForUser()` to `apps/server/storage/agent_actions.js`
- Wired follow-up routing into `/chat` before the normal capability routers

## Behavior
- `did that send?`
  - Reports the latest action status using the stored action record and action-run store.
- `retry that`
  - Replays the latest retryable action using the original request text.
- `go ahead`
  - If the latest action is awaiting approval, returns an approval-specific continuation message.
- `go ahead` on a missing-input action
  - Returns the missing-input guidance instead of silently failing.

## Validation
- `apps/server/tests/action_followup_router.test.js`
- Live `/chat` verification on the backend after restart
