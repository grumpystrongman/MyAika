---
children_hash: 6b300f0e477b42e1e930fcc9c114a7da5267699127670e24ade640a7b85bcc76
compression_ratio: 0.6253164556962025
condensation_order: 0
covers: [ui_chat_approval_smoke_test.md]
covers_token_total: 395
summary_level: d0
token_count: 247
type: summary
---
### UI Chat Approval Smoke Testing
The UI Chat Approval Smoke Test provides a deterministic validation framework for chat approval workflows, including "approve-execute" and "deny" scenarios.

*   **Architectural Approach**: Utilizes Playwright to simulate user interactions while mocking critical backend endpoints (`/chat`, `/api/approvals`, `/api/auth/me`).
*   **Key Files**:
    *   `scripts/ui_chat_approval_smoke.js`: Core test logic.
    *   `scripts/full_smoke_test.js`: Integration point for the broader suite.
    *   `package.json`: Contains the primary execution script `npm run ui:smoke:approval`.
*   **Operational Requirements**:
    *   Environment: Requires `UI_BASE_URL` (default: `http://127.0.0.1:3000`).
    *   Configuration: Timeout is adjustable via `UI_SMOKE_TIMEOUT_MS` (default: 45000ms).
    *   Prerequisites: Playwright must be installed via `npm install`.

For detailed implementation and test flow definitions, refer to `ui_chat_approval_smoke_test.md`.