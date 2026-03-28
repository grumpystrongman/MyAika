---
title: Daily Stack Bring-up Script
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T15:55:23.281Z'
updatedAt: '2026-03-27T15:55:23.281Z'
---
## Raw Concept
**Task:**
Document daily stack bring-up and verification workflow

**Files:**
- scripts/daily_up_verify.ps1

**Flow:**
Bring up stack (compose up) -> Wait for services (aika-shell, mcp-worker, web-ui) -> Verify (verify_core_stack.ps1)

**Timestamp:** 2026-03-27

**Author:** Aika System

**Patterns:**
- `docker compose -f .* --profile .* ps --format json` - Used to inspect service state
- `powershell -ExecutionPolicy Bypass -File .*` - Used to execute verification scripts

## Narrative
### Structure
The daily stack bring-up process uses a PowerShell script (scripts/daily_up_verify.ps1) to manage the lifecycle of the Aika core stack.

### Dependencies
Requires docker-compose.aika-stack.yml and scripts/verify_core_stack.ps1.

### Highlights
Automates docker compose up with optional build; waits for specific services (aika-shell, mcp-worker, web-ui) to reach a healthy or running state; automatically runs verification via verify_core_stack.ps1, with fallback if -WebUrl is not supported; provides detailed rollback guidance on failure, optionally running compose down.

### Rules
1. Script checks for the existence of the specified compose file and verifier script before proceeding.
2. Readiness checks prefer 'healthy' status, but fallback to 'running' or 'up' if healthchecks are undefined.
3. If verification with -WebUrl fails due to parameter mismatch, the script automatically retries with -BaseUrl only.
4. Rollback guidance is always displayed on failure to facilitate manual recovery.

## Facts
- **script_location**: The daily stack bring-up script is located at scripts/daily_up_verify.ps1 [project]
- **monitored_services**: Services monitored during bring-up are aika-shell, mcp-worker, and web-ui [project]
- **wait_timeout**: The default wait timeout for services is 180 seconds [project]
