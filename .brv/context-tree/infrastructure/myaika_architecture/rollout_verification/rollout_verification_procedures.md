---
title: Rollout Verification Procedures
tags: []
keywords: []
importance: 65
recency: 1
maturity: validated
updateCount: 3
createdAt: '2026-03-27T18:45:24.497Z'
updatedAt: '2026-03-28T20:24:07.196Z'
---
## Raw Concept
**Task:**
Verify rollout completion across cohorts

**Changes:**
- Added UI cohort isolation to verify_rollout_completion.ps1
- Automated UI navigation, chat approval, and wizard chess smoke tests

**Files:**
- scripts/verify_rollout_completion.ps1

**Timestamp:** 2026-03-28

## Narrative
### Structure
Rollout verification runs tests across multiple cohorts: daily runtime, write-path, compose config, command grammar, workflow, digest, and UI navigation.

### Highlights
UI cohorts are tested in isolated Next.js instances on dynamic ports.

### Rules
Rule 1: Run `scripts/verify_rollout_completion.ps1` to verify all cohorts.
Rule 2: Failing any cohort results in verification failure (exit code 1).

### Examples
Verification command: `powershell -ExecutionPolicy Bypass -File scripts/verify_rollout_completion.ps1`

## Facts
- **rollout_verification_cohorts**: Rollout verification runs across 8+ distinct cohorts. [project]
