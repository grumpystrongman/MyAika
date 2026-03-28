---
children_hash: c5ad3cd9a8586a27a498b37695e39630d18b6cb08e9ed4cba1542a80c383ee5f
compression_ratio: 0.8878205128205128
condensation_order: 1
covers: [ui_chat_approval_smoke/_index.md]
covers_token_total: 312
summary_level: d1
token_count: 277
type: summary
---
# UI Chat Approval Smoke Testing Overview

The UI Chat Approval Smoke Testing framework provides deterministic validation for chat-based approval workflows, ensuring correct execution of "approve-execute" and "deny" scenarios.

## Architectural Approach
The system employs Playwright to simulate user-driven interactions, utilizing mocked backend endpoints for `/chat`, `/api/approvals`, and `/api/auth/me` to isolate the UI frontend logic.

## Implementation Details
*   **Core Logic**: Defined in `scripts/ui_chat_approval_smoke.js`.
*   **Integration**: Incorporated into the broader testing suite via `scripts/full_smoke_test.js`.
*   **Execution**: Triggered via `npm run ui:smoke:approval` as defined in `package.json`.

## Operational Requirements
*   **Environment**: Relies on `UI_BASE_URL` (default: `http://127.0.0.1:3000`).
*   **Configuration**: Supports a configurable `UI_SMOKE_TIMEOUT_MS` (default: 45000ms).
*   **Prerequisites**: Requires Playwright installation via `npm install`.

For comprehensive implementation details and test flow definitions, see `ui_chat_approval_smoke_test.md`.