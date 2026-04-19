# Shell Interaction Reliability Phase 6

## Scope
- Remove avatar-stage interference with composer controls
- Chain approval execution results back into the same assistant message
- Tighten mixed orchestration rendering for read/action clarity

## Changes
- Avatar overlay no longer captures pointer events over the composer.
- Added explicit `Hide` control in the avatar top bar instead of relying on container right-click behavior.
- Mixed orchestration cards now render grouped `Reads` and `Actions` sections.
- Approval execution results now render inline per approval instead of only dumping one raw execution blob.

## Files
- `apps/web/pages/index.jsx`
- `apps/web/src/assistantOrchestration.js`
- `apps/web/src/assistantOrchestration.test.js`

## QA
- `node --test apps/web/src/assistantOrchestration.test.js apps/web/src/assistantShellStatus.test.js apps/web/src/avatar/lenoreConversationStates.test.js apps/web/src/avatar/lenoreFacialPerformance.test.js`
- `npm run build -w apps/web`
- Live browser verification on `http://127.0.0.1:3412/`

## Artifacts
- `output/playwright/assistant-shell-phase6/mixed-chat-send-typed-click.png`
- `output/playwright/assistant-shell-phase6/mixed-chat-send-typed-click.txt`
- `output/playwright/assistant-shell-phase6/mixed-chat-send-enter.png`
- `output/playwright/assistant-shell-phase6/mixed-chat-executed.png`
- `output/playwright/assistant-shell-phase6/mixed-chat-executed.txt`

## Result
- `Send` is no longer blocked by the floating avatar overlay.
- Mixed replies are easier to scan.
- Approval execution status is visible in the same conversation message where the approval originated.
