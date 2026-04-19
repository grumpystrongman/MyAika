# Shell Mixed Orchestration Phase 5

Date: 2026-04-19

## Goal

Turn mixed `/chat` orchestration into a first-class main-shell experience instead of a flat assistant text blob.

This phase focused on:

- richer rendering of mixed orchestration replies
- message-level multi-approval support
- approval-result chaining between the shell queue and the chat log

## Delivered

- Assistant messages can now carry:
  - `orchestration`
  - multiple `approvals`
  - `approvalExecution`
- Mixed replies now render an `Orchestration` card in the chat log.
- Approval cards in the chat log now support multiple approvals per assistant message.
- Shell queue approval actions now update the corresponding assistant message approval state in the same conversation.

## Files

- `apps/web/pages/index.jsx`
- `apps/web/src/assistantOrchestration.js`
- `apps/web/src/assistantOrchestration.test.js`

## UI Behavior

For a mixed request like:

```text
Hey Aika, check my weather in Raleigh and send telegram "Ping me when done" chat 12345
```

the main chat page now shows:

- assistant textual reply
- orchestration summary card
  - read items
  - action items
  - original clause breakdown
- approval card attached to the same assistant message

If the approval is approved from the shell queue:

- the shell queue updates
- the assistant message approval card updates from `Pending` to `Approved`
- the message-level card now shows `Execute`
- status text is kept in sync

## Verification

### Tests

- `node --test apps/web/src/assistantOrchestration.test.js apps/web/src/assistantShellStatus.test.js apps/web/src/avatar/lenoreConversationStates.test.js apps/web/src/avatar/lenoreFacialPerformance.test.js`
- `npm run build -w apps/web`

### Browser verification

Verified on:

- `http://127.0.0.1:3412/`

Artifacts:

- `output/playwright/assistant-shell-phase4/mixed-orchestration-chat.png`
- `output/playwright/assistant-shell-phase4/mixed-orchestration-chat.txt`
- `output/playwright/assistant-shell-phase4/mixed-orchestration-approved.png`
- `output/playwright/assistant-shell-phase4/mixed-orchestration-approved.txt`

Confirmed:

- mixed reply renders as structured orchestration + approval card
- shell approval action updates the corresponding in-chat approval card

## Real Issue Found

There is still a chat-composer UI bug:

- the floating avatar canvas can intercept pointer events over the `Send` button area

This does not block keyboard send or the backend orchestration path, but it is a real shell usability issue and should be fixed in the next UI phase.
