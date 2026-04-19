# Mixed Read + Execute Orchestration Phase 4

Date: 2026-04-19

## Goal

Allow one utterance to combine:

- read/query work
- approval-aware execution work

without losing the existing approval model or degrading the simpler single-purpose routers.

## Delivered

- Added a dedicated mixed orchestrator:
  - `apps/server/src/aika/mixedCapabilityRouter.js`
- Integrated it into `/chat` ahead of:
  - execution-only orchestration
  - core read/query orchestration
  - generic action pipeline
- Extended the core router to support single-capability clauses when explicitly requested by the mixed orchestrator:
  - `apps/server/src/aika/coreCapabilityRouter.js`

## Supported Pattern

Example:

```text
Hey Aika, check my weather in Raleigh and send telegram "Ping me when done" chat 12345
```

Result:

- weather answer is returned immediately
- Telegram send is routed into the existing approval flow
- `/chat` returns:
  - `orchestrated: true`
  - `approvals`
  - structured `orchestration` metadata

## Files

- `apps/server/src/aika/mixedCapabilityRouter.js`
- `apps/server/src/aika/coreCapabilityRouter.js`
- `apps/server/index.js`
- `apps/server/tests/mixed_capability_router.test.js`

## Verification

### Tests

- `node --test apps/server/tests/mixed_capability_router.test.js apps/server/tests/core_capability_router.test.js apps/server/tests/execution_capability_router.test.js apps/server/tests/affect_model.test.js`
- `node --check apps/server/index.js`

### Live backend verification

Verified on:

- `http://127.0.0.1:3512/chat`

Observed:

- weather leg completed
- Telegram leg returned approval-required
- approval object was returned inline
- structured orchestration payload preserved clause order

## Notes

- A real parser bug was fixed during this phase:
  - `check my email` was being misclassified as `email.send`
  - mixed clause classification now prioritizes read/query interpretation when the clause clearly looks like a read request
- The live backend on `3512` had to be explicitly restarted because the previous listener was still running an older server process.

## Boundary

This phase handles mixed read + execute orchestration at the backend layer.

It does **not** yet do:

- richer reply formatting in the main UI for mixed orchestration sections
- automatic inline approval-result chaining back into the same mixed conversational turn
- cross-clause dependency planning (for example, “search X, then email the top result summary to Y”)
