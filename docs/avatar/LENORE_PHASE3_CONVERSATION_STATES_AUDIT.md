# Lenore Phase 3 Conversation States Audit

Date: 2026-04-17

## Scope

Phase 3 replaced Lenore's clip-era conversational posing with authored runtime states for:

- `paused`
- `listening`
- `thinking`
- `speaking`

This phase also restored explicit facial-state application on top of the authored body states so the renderer no longer depends on imported animation clips for expression or mouth motion during conversation.

## Changes

- Added authored conversational state engine:
  - [lenoreConversationStates.js](c:/Users/grump/Repo/MyAika/apps/web/src/avatar/lenoreConversationStates.js)
- Integrated authored states into the live Lenore renderer:
  - [LenoreAvatar.jsx](c:/Users/grump/Repo/MyAika/apps/web/src/components/LenoreAvatar.jsx)
- Added direct state tests:
  - [lenoreConversationStates.test.js](c:/Users/grump/Repo/MyAika/apps/web/src/avatar/lenoreConversationStates.test.js)
- Added repeatable browser audit harness:
  - [audit_lenore_phase3.mjs](c:/Users/grump/Repo/MyAika/scripts/avatar_pipeline/audit_lenore_phase3.mjs)

## Validation

### Automated

- `node --test apps/web/src/avatar/lenoreConversationStates.test.js`
- `npm run build -w apps/web`

### Browser audit

The live site on `http://127.0.0.1:3412/` was audited by injecting explicit Lenore runtime overrides and capturing each conversational state.

Artifacts:

- [paused.png](c:/Users/grump/Repo/output/playwright/lenore-phase3/paused.png)
- [listening.png](c:/Users/grump/Repo/output/playwright/lenore-phase3/listening.png)
- [thinking.png](c:/Users/grump/Repo/output/playwright/lenore-phase3/thinking.png)
- [speaking.png](c:/Users/grump/Repo/output/playwright/lenore-phase3/speaking.png)
- [audit.json](c:/Users/grump/Repo/output/playwright/lenore-phase3/audit.json)

## Result

- Lenore no longer depends on the unstable imported body clip for ordinary conversation states.
- Rest and speech states now come from authored upper-body poses with explicit transitions.
- Facial performance is reapplied each frame after the authored state pose is resolved.
- The live renderer now exposes stable, reviewable paused/listening/thinking/speaking states for further refinement in the next phase.

## Remaining boundary

Phase 3 stabilizes the conversational state machine, but it does not yet finish the dedicated facial-performance pass. The next phase should tighten:

- jaw/lip timing
- cheeks/brows/eyes by affect
- state-specific facial nuance on top of the authored body system
