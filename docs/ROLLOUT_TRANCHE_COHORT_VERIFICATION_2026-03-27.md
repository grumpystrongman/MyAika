# AIKA Rollout Tranche + Cohort Verification

Date: 2026-03-27  
Verifier: Codex runtime lane (local workspace)

## Scope

- Tranches: Phase 1 through Phase 14 in Linear project `AIKA Architecture Rollout`.
- Cohorts: runtime/service cohorts (`daily`, `test`, `experimental`) and UI/runtime verification cohorts.

## Linear Tranche Status

All rollout phases are `Done` in Linear:

- Phase 1 (`JEF-60`) through Phase 14 (`JEF-72`) all completed.
- Queried via `list_issues(project=\"AIKA Architecture Rollout\")` and validated no non-done phase tickets.

## Cohort Verification Results

### 1. Core runtime cohort (daily profile)

Command:

```powershell
npm run stack:daily:nobuild
```

Result:

- PASS
- Services ready: `aika-shell`, `mcp-worker`, `web-ui`
- Embedded verifier summary: `PASS=13 WARN=1 FAIL=0`
- Warning was expected auth-gated audit endpoint behavior (`Auth required for this endpoint in current mode`).

### 2. Core verifier cohort (read-write path)

Command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_core_stack.ps1 -IncludeWriteChecks
```

Result:

- PASS
- Daily digest write check: `PASS`
- Summary: `PASS=13 WARN=1 FAIL=0`

### 3. Compose profile cohort (test + experimental config integrity)

Command:

```powershell
docker compose -f docker-compose.aika-stack.yml --profile test config
docker compose -f docker-compose.aika-stack.yml --profile experimental config
```

Result:

- PASS (`compose_profile_config_ok:test,experimental`)

### 4. Command grammar + lane execution cohort

Command:

```bash
node --test apps/server/tests/aika_intent_protocol.test.js apps/server/tests/aika_command_router.test.js
```

Result:

- PASS (`12/12`)

### 5. Digest + approval policy cohort

Command:

```bash
node --test apps/server/tests/aika_digest.test.js apps/server/tests/safety_approvals.test.js apps/server/tests/email_send_with_context.test.js apps/server/tests/aika_intent_protocol.test.js apps/server/tests/aika_command_router.test.js
```

Result:

- PASS (`16/16`)

### 6. UI navigation smoke cohort (current UI tabs)

Command:

```bash
UI_BASE_URL=http://127.0.0.1:3105 node scripts/ui_smoke.js
```

Result:

- PASS (`UI smoke passed.`)
- Note: `scripts/ui_smoke.js` updated to current Settings/Guide expectations.

### 7. Chat approval UI cohort

Command:

```bash
UI_BASE_URL=http://127.0.0.1:3105 node scripts/ui_chat_approval_smoke.js
```

Result:

- PASS (`UI chat approval smoke passed.`)
- Verified inline `Approve`, `Execute`, and `Deny` flows via deterministic mocks.

### 8. Web build cohort

Command:

```bash
npm run build -w apps/web
```

Result:

- PASS (Next.js production build success)

### 9. Module registry cohort

Command:

```bash
node --test apps/server/tests/aika_modules.test.js
```

Result:

- PASS (`1/1`)
- Validates the Level 1 → Level 5+++ registry loads all 38 modules.

## Completion Decision

All rollout tranches (Phase 1-14) and verification cohorts checked above are complete and currently passing in this environment.

## Consolidated Verifier Rerun

Command:

```powershell
npm run verify:rollout
```

Result:

- PASS
- Cohorts passed in one run:
  - Daily runtime
  - Write-path verifier
  - Compose (`test`, `experimental`)
  - Command grammar/lane
  - Digest/approval
  - Module registry
  - Web build
  - UI navigation
  - UI chat approval

## Notes

- Existing non-rollout workspace changes remain in git status and were not modified/reverted by this verification pass.
- Audit chain warning in verifier is mode/auth related, not a rollout failure.
