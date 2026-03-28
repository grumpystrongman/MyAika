---
title: Wizard Chess UI Configuration
tags: []
keywords: []
importance: 65
recency: 1
maturity: validated
updateCount: 3
createdAt: '2026-03-27T21:21:35.212Z'
updatedAt: '2026-03-28T20:24:05.235Z'
---
## Raw Concept
**Task:**
Resolve Wizard Chess white-screen and infinite load issues

**Changes:**
- Isolated Next.js dist directories per dev instance using NEXT_DIST_DIR
- Updated next.config.mjs to use environment-based distDir
- Updated scripts/start_wizard_chess_dev.ps1 to use .next-wizard-<port>
- Updated scripts/verify_rollout_completion.ps1 UI cohorts to use .next-rollout-<port>

**Files:**
- apps/web/next.config.mjs
- scripts/start_wizard_chess_dev.ps1
- scripts/verify_rollout_completion.ps1

**Timestamp:** 2026-03-28

## Narrative
### Structure
Next.js build artifacts are now isolated by port to prevent cross-instance cache corruption on Windows/OneDrive environments.

### Highlights
Webpack filesystem cache is disabled in dev mode to avoid intermittent restore warnings.

### Rules
Rule 1: Always use NEXT_DIST_DIR environment variable for isolated dev/test instances.
Rule 2: Use .next-wizard-<port> for development and .next-rollout-<port> for verification cohorts.

### Examples
Example distDir configuration in next.config.mjs: `const configuredDistDir = (process.env.NEXT_DIST_DIR || "").trim();`

## Facts
- **nextjs_dist_isolation**: Next.js dist directories are now isolated by port. [project]
- **webpack_cache**: Webpack filesystem cache is disabled in dev mode. [preference]
