# Lenore Phase 4 Facial Performance Audit

Date: 2026-04-17

## Scope

Phase 4 tightens Lenore's facial performance on the live conversation runtime:

- jaw vs lip timing
- empathy-driven eyes / brows / cheeks
- state-specific facial nuance layered on top of the authored conversation states from Phase 3

## Changes

- Added dedicated facial-performance module:
  - [lenoreFacialPerformance.js](c:/Users/grump/Repo/MyAika/apps/web/src/avatar/lenoreFacialPerformance.js)
- Added facial-performance unit tests:
  - [lenoreFacialPerformance.test.js](c:/Users/grump/Repo/MyAika/apps/web/src/avatar/lenoreFacialPerformance.test.js)
- Updated Lenore renderer to use the dedicated facial module:
  - [LenoreAvatar.jsx](c:/Users/grump/Repo/MyAika/apps/web/src/components/LenoreAvatar.jsx)
- Wired empathy mode through runtime motion:
  - [index.jsx](c:/Users/grump/Repo/MyAika/apps/web/pages/index.jsx)
- Added repeatable browser review harness:
  - [audit_lenore_phase4.mjs](c:/Users/grump/Repo/MyAika/scripts/avatar_pipeline/audit_lenore_phase4.mjs)

## Validation

### Automated

- `node --test apps/web/src/avatar/lenoreConversationStates.test.js apps/web/src/avatar/lenoreFacialPerformance.test.js`
- `npm run build -w apps/web`

### Browser review

Live review run against:

- `http://127.0.0.1:3412/`

Artifacts:

- empathy / affect cases
  - [comfort.png](c:/Users/grump/Repo/output/playwright/lenore-phase4/comfort.png)
  - [executive.png](c:/Users/grump/Repo/output/playwright/lenore-phase4/executive.png)
  - [playful.png](c:/Users/grump/Repo/output/playwright/lenore-phase4/playful.png)
- phoneme cases
  - [phoneme-th.png](c:/Users/grump/Repo/output/playwright/lenore-phase4/phoneme-th.png)
  - [phoneme-s.png](c:/Users/grump/Repo/output/playwright/lenore-phase4/phoneme-s.png)
  - [phoneme-ch.png](c:/Users/grump/Repo/output/playwright/lenore-phase4/phoneme-ch.png)
  - [phoneme-ah.png](c:/Users/grump/Repo/output/playwright/lenore-phase4/phoneme-ah.png)
- audit index
  - [audit.json](c:/Users/grump/Repo/output/playwright/lenore-phase4/audit.json)

## Result

- Lenore now separates empathy-driven face behavior from coarse motion-state logic.
- `co_regulate` / `comfort` can raise inner brows and soften cheeks.
- `competent` / `executive` tightens lips and lowers brows.
- fallback talking mouth motion is calmer and avoids the earlier game-rig jaw flap.
- `th` tongue visibility is stronger and more reliable under early cue interpolation.

## Remaining boundary

Phase 4 materially improves facial behavior, but it does not yet optimize the runtime asset itself. The next phase should split:

- a lighter bust-up conversation model
- a separate full-body review model

That is the next major quality and performance step.
