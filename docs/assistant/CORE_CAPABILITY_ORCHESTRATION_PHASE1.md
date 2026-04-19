# Core Capability Orchestration Phase 1

## Goal

Upgrade `MyAika` from isolated single-purpose handlers to a unified assistant runtime path for core requests such as:

- inbox
- calendar
- weather
- web search

This phase is intentionally limited to core read/query flows. Outbound messaging, drafting, and approvals remain in later phases.

## What changed

- Added a dedicated orchestration parser and executor:
  - `apps/server/src/aika/coreCapabilityRouter.js`
- Wired the orchestrator into `/chat` before the generic action planner:
  - `apps/server/index.js`
- Added support for embedded search phrases:
  - `google search ...`
  - `chatgpt search ...`
  - `search the web for ...`
- Added unit coverage:
  - `apps/server/tests/core_capability_router.test.js`

## Behavior

The orchestrator activates when the utterance is an assistant-style combined request, for example:

- `Hey Aika, check my email, calendar, weather, and do a google search for OpenAI pricing`

It produces a structured multi-section reply in stable order:

1. Inbox
2. Calendar
3. Weather
4. Web Search

If one capability is unavailable, that section degrades gracefully without failing the whole request.

## Important routing rule

The orchestration path must run before `handleActionIntent(...)`.

Reason:

The action planner can misclassify phrases like `check my email` as outbound email actions. The orchestrator now preempts that for core assistant queries.

## Weather/search conflict fix

Combined utterances that contain both weather and search can accidentally let the search query leak into the weather parser.

Fix:

- If the utterance contains an embedded search phrase and does not contain an explicit weather location, the weather leg stops guessing and asks for the location instead.

## Validation

### Unit tests

- `node --test apps/server/tests/core_capability_router.test.js apps/server/tests/affect_model.test.js`

### Syntax

- `node --check apps/server/index.js`

### Live request

Tested against:

- `http://127.0.0.1:3512/chat`

Example request:

`Hey Aika, check my email, calendar, weather, and do a google search for OpenAI pricing`

Observed result:

- orchestrated response
- stable section ordering
- no action-planner interception
- graceful weather fallback when no location is available

## Next phase

Expand orchestration from read/query flows into execution flows with approval-aware actions, starting with:

- email drafting/reply assist
- calendar create/propose-hold flows
- outbound messaging routing
