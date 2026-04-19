# Capability Reply Hints Phase 7

## Scope
- Explain capability readiness in-context inside AIKA replies
- Reuse the same capability model already exposed in the shell
- Keep hints limited to the capabilities the user just invoked

## Changes
- Added a server-side reply hint layer:
  - `apps/server/src/aika/capabilityReplyHints.js`
- `/chat` now appends a `Capability status` block when the reply references:
  - multiple capabilities
  - unavailable capabilities
  - execution-oriented capabilities such as email, calendar, Telegram, WhatsApp, or SMS
- Hints are also returned as structured `capabilityHints` data in the JSON response.

## Files
- `apps/server/src/aika/capabilityReplyHints.js`
- `apps/server/tests/capability_reply_hints.test.js`
- `apps/server/index.js`

## QA
- `node --test apps/server/tests/capability_reply_hints.test.js apps/server/tests/mixed_capability_router.test.js apps/server/tests/core_capability_router.test.js apps/server/tests/execution_capability_router.test.js apps/server/tests/affect_model.test.js`
- `node --check apps/server/index.js`
- Live backend verification on `3512`
- Live browser verification on `3412`

## Artifacts
- `output/playwright/assistant-shell-phase7/capability-hints-chat.png`
- `output/playwright/assistant-shell-phase7/capability-hints-chat.txt`

## Result
- AIKA now explains what is available versus what still needs setup in the same reply where the user asked for the capability.
- Mixed requests such as weather + Telegram now answer with both the requested result and a direct capability-readiness explanation.
