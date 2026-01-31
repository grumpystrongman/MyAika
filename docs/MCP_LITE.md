# MCP-lite Tool Control Plane

This repo includes an MCP-lite control plane that standardizes all external actions behind a policy, approval, and audit layer. The goal is HIPAA-first safety with explicit approvals and full audit trails.

## Architecture
- **ToolRegistry**: registers tool definitions + handlers.
- **ToolExecutor**: runs policy checks, approval gating, and audits before calling tools.
- **PolicyEngine**: PHI detection/redaction, allowlists, outbound domain checks.
- **Approval Gate**: draft-only by default for risky tools; explicit approval required.
- **Audit Logger**: append-only JSONL audit records with rotation.
- **Memory Vault**: tiered memory storage with encryption for PHI.

## Tool Surface (API)
- `GET /api/tools` — list tools
- `GET /api/tools/:name` — describe a tool
- `POST /api/tools/call` — call a tool with policy + audit
- `POST /api/approvals` — create an approval request
- `POST /api/approvals/:id/approve` — approve an action
- `POST /api/approvals/:id/execute` — execute a previously approved action

## PHI Mode
By default, `PHI_MODE=true` (see `.env.example`). Policy checks:
- Detects likely PHI (phones, emails, DOB, SSN, MRN, addresses, patient terms).
- Redacts PHI before logging.
- Blocks or requires approval for outbound tools when PHI is detected.

### Redaction tokens
`[REDACTED_PHONE]`, `[REDACTED_EMAIL]`, `[REDACTED_SSN]`, `[REDACTED_DOB]`, `[REDACTED_MRN]`, `[REDACTED_ADDRESS]`

## Approvals
Outbound actions are draft-only by default. A call returns:
```
{ status: "approval_required", approval: { id, token?, ... } }
```

Approval flow:
1) `POST /api/approvals/:id/approve`
2) `POST /api/approvals/:id/execute` with approval token

## Memory Vault (Tiered)
Tiers:
- `memory_profile` (low)
- `memory_work` (medium)
- `memory_phi` (high, encrypted)

PHI tier uses AES-256-GCM encryption. Set `ENCRYPTION_KEY` in `.env`.

## Configuration
Add these in `.env` (see `.env.example`):
```
PHI_MODE=true
ALLOWED_OUTBOUND_DOMAINS=slack.com,discord.com,api.telegram.org
TOOL_ALLOWLIST_BY_MODE_NORMAL=meeting.summarize,notes.create,notes.search
TOOL_ALLOWLIST_BY_MODE_PHI=meeting.summarize,memory.write,memory.search
ENCRYPTION_KEY=change_me_32bytes_hex_or_passphrase
AUDIT_LOG_PATH=./data/audit.log
RATE_LIMIT_PER_MIN=60
```

## Adding a Tool
1) Implement the tool in `apps/server/mcp/tools/`.
2) Register it in `apps/server/mcp/index.js` with:
   - `name`
   - `description`
   - `paramsSchema` (for docs)
   - `outbound`, `requiresApproval`, `riskLevel` (if needed)
3) Call via `POST /api/tools/call`.

## Approval + Audit Example
1) `POST /api/tools/call` with `name: "email.send"` → returns approval required
2) `POST /api/approvals/:id/approve`
3) `POST /api/approvals/:id/execute` with token
4) All steps log to `data/audit.log` (redacted if PHI).

## Notes
- The model never calls providers directly; all actions go through ToolExecutor.
- Outbound domain allowlists are enforced by policy.
- Approval tokens are required for execution.


## Features tab
The web UI includes a Features tab that discovers MCP tools, groups them by service, and provides basic connect flows. Use the Refresh and Copy Diagnostics buttons for troubleshooting.
