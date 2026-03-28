---
title: Phase 15 Rollout Verification
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T18:35:48.699Z'
updatedAt: '2026-03-27T18:35:48.699Z'
---
## Raw Concept
**Task:**
Verify AIKA Architecture Rollout Phase 1-14 and runtime/UI cohorts

**Changes:**
- Completed Phase 1-14 verification
- Updated UI smoke test expectations

**Files:**
- docs/ROLLOUT_TRANCHE_COHORT_VERIFICATION_2026-03-27.md
- scripts/ui_smoke.js

**Flow:**
Verify Linear tickets -> Run runtime cohorts -> Run test/experimental config checks -> Run intent/grammar tests -> Run UI smoke/approval tests

**Timestamp:** 2026-03-27

**Author:** Codex runtime lane

## Narrative
### Structure
Verification of AIKA Architecture Rollout Phase 1-14. Includes runtime cohorts (daily, test, experimental), command grammar/lane execution, digest/approval policy tests, and UI navigation/approval smoke tests.

### Dependencies
Requires Playwright for UI tests, docker-compose for profile tests.

### Highlights
All rollout tranches (Phase 1-14) are marked as Done in Linear. All 8 verification cohorts passed in the local workspace.

### Rules
1. Run stack daily cohort: npm run stack:daily:nobuild
2. Run core verifier: powershell -ExecutionPolicy Bypass -File scripts/verify_core_stack.ps1 -IncludeWriteChecks
3. Run compose profile tests: docker compose -f docker-compose.aika-stack.yml --profile [test|experimental] config
4. Run intent protocol tests: node --test apps/server/tests/aika_intent_protocol.test.js apps/server/tests/aika_command_router.test.js
5. Run digest/approval tests: node --test apps/server/tests/aika_digest.test.js apps/server/tests/safety_approvals.test.js apps/server/tests/email_send_with_context.test.js apps/server/tests/aika_intent_protocol.test.js apps/server/tests/aika_command_router.test.js
6. Run UI smoke test: UI_BASE_URL=http://127.0.0.1:3105 node scripts/ui_smoke.js
7. Run chat approval smoke test: UI_BASE_URL=http://127.0.0.1:3105 node scripts/ui_chat_approval_smoke.js

### Examples
UI Smoke Test flow verifies: Chat, Recordings, Tools, Action Runner, Features, Settings, Debug, Guide, Capabilities

## Facts
- **rollout_status**: Rollout phases 1-14 (JEF-60 to JEF-72) are marked Done in Linear [project]
- **verification_status**: All 8 verification cohorts passed as of 2026-03-27 [project]
