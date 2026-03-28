---
title: UI Chat Approval Smoke Test
tags: []
keywords: []
importance: 50
recency: 1
maturity: draft
createdAt: '2026-03-27T18:26:13.929Z'
updatedAt: '2026-03-27T18:26:13.929Z'
---
## Raw Concept
**Task:**
Document the UI chat approval smoke testing framework

**Files:**
- scripts/ui_chat_approval_smoke.js
- scripts/full_smoke_test.js
- package.json

**Timestamp:** 2026-03-27

**Author:** MyAika Team

## Narrative
### Structure
The UI chat approval smoke test uses Playwright to simulate user interactions with chat approval workflows. It mocks the backend endpoints (/chat, /api/approvals, /api/auth/me) to provide a deterministic testing environment for approve-execute and deny flows.

### Highlights
Validates the "approve-execute" workflow (request -> approval -> approve -> execute -> confirm), validates the "deny" workflow (request -> approval -> deny -> confirm), automates test execution via Playwright, and integrates into the full smoke test suite (scripts/full_smoke_test.js) and package.json scripts (npm run ui:smoke:approval).

### Rules
1. Ensure Playwright is installed via `npm install` before running.
2. Set `UI_BASE_URL` env var to point to the web server (defaults to http://127.0.0.1:3000).
3. Set `UI_SMOKE_TIMEOUT_MS` to adjust test timeout (defaults to 45000ms).

## Facts
- **testing_framework**: UI chat approval smoke tests are implemented using Playwright [project]
- **mock_endpoints**: The smoke test mocks /chat and /api/approvals endpoints [project]
- **npm_script**: The test runner is triggered via `npm run ui:smoke:approval` [project]
