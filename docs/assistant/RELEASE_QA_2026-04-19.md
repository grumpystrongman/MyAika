# Release QA 2026-04-19

## Live Runtime
- Frontend: `http://127.0.0.1:3412/`
- Backend: `http://127.0.0.1:8787/`

## Avatar
- Default runtime locked to stable Lenore conversation shell
- Stable supported frames:
  - `portrait`
  - `bust`
- Disabled unstable frames:
  - `waist`
  - `three_quarter`
  - `full`
- Procedural hostess gown disabled in stable runtime
- Stable default look:
  - `formal_dark`
  - real Lenore clothing path
  - bust framing

## Browser QA Artifacts
- `output/playwright/live-audit-2026-04-19/stable-bust-current.png`
- `output/playwright/live-audit-2026-04-19/stable-bust-speaking-current.png`
- `output/playwright/live-audit-2026-04-19/stable-bust-after-handfix.png`
- `output/playwright/live-audit-2026-04-19/stable-bust-speaking-after-handfix.png`
- `output/playwright/live-audit-2026-04-19/postfix-root.png`
- `output/playwright/release-qa-2026-04-19/root-paused.png`
- `output/playwright/release-qa-2026-04-19/root-paused-final.png`
- `output/playwright/release-qa-2026-04-19/root-speaking-final.png`
- `output/playwright/release-qa-2026-04-19/avatar-settings.png`
- `output/playwright/release-qa-2026-04-19/avatar-settings-final.png`
- `output/playwright/release-qa-2026-04-19/frame-portrait-final.png`
- `output/playwright/release-qa-2026-04-19/hair-color-final.png`
- `output/playwright/release-qa-2026-04-19/frame-options.json`
- `output/playwright/release-qa-2026-04-19/select-audit-final.json`

## Automated Validation
- Web build:
  - `npm run build -w apps/web`
- Avatar tests:
  - `apps/web/src/avatar/lenoreConversationStates.test.js`
  - `apps/web/src/avatar/lenoreFacialPerformance.test.js`
- Assistant backend tests:
  - `apps/server/tests/affect_model.test.js`
  - `apps/server/tests/agent_actions.test.js`
  - `apps/server/tests/action_followup_router.test.js`
  - `apps/server/tests/core_capability_router.test.js`
  - `apps/server/tests/execution_capability_router.test.js`
  - `apps/server/tests/mixed_capability_router.test.js`
  - `apps/server/tests/capability_reply_hints.test.js`

## Final Notes
- The purchased Lenore asset is not production-safe as a full-body live assistant shell.
- The release runtime is intentionally constrained to the stable bust/portrait presentation.
- The stable shell uses stricter facial target filtering and authored conversation states to avoid the prior face corruption and overhead-arm failures.
- Full-body review remains an asset-pipeline problem, not a chat/runtime problem.
