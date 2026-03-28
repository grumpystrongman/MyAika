# AIKA Operating Model

MyAika now enforces an operator-first execution loop:

1. Goal
2. Capability Map
3. Plan
4. Tool Routing
5. Execution
6. Evidence
7. Risks
8. Next Step

## Command Grammar

Recognized top-level intents:

- `EXECUTE`
- `PREPARE`
- `ANALYZE`
- `CONTROL`
- `BUILD`
- `MONITOR`
- `OPTIMIZE`
- `SIMULATE`
- `STAGE`
- `AUTOPILOT`

Examples:

- `AIKA, execute patch and verify this API`
- `AIKA, prepare release notes for leadership`
- `AIKA, analyze vendor lock-in risk`
- `AIKA, control browser to collect pricing`
- `AIKA, stage deploy checklist for approval`

## Lane Routing

- Code/repo/scripts: `Codex + MCP`
- Deterministic browser actions: `agent-browser`
- Complex browser workflows: `Skyvern`
- Desktop/GUI/sandboxed computer use: `CUA`
- Reusable workflow orchestration: `OpenClaw`
- Tracing/evals/monitoring: `Opik`

## Skill-First Workflow Pack

When a request matches a production workflow skill, runtime routes to the skill handler before generic intent fallback.

Current high-frequency workflow skills:

- `daily_digest_cockpit`
- `research_and_summarize`
- `inbox_triage_fastlane`
- `calendar_hygiene_fastlane`
- `meeting_to_action_engine`
- `incident_triage_command`

Examples:

- `AIKA, research and summarize payer mix variance`
- `AIKA, execute triage inbox for this morning`
- `AIKA, clean my calendar for conflicts`
- `AIKA, prepare meeting packet for leadership sync`
- `AIKA, start incident response for claims outage`

## Approval Policy

Auto:

- Read/search/inspect/draft/safe tests/sandbox work

Approval required:

- Installs, deletes, overwrites, logins, secrets
- Sending/publishing actions
- `git push`, deploy, system changes
- Docker/container changes
- Trust boundary crossings

Never:

- Stealth or bypass behavior
- Hidden persistence
- Secret extraction

## Tier-2 Approval Contract

Approval cards for high-impact actions expose this payload consistently:

- `Action`
- `Why`
- `Tool`
- `Boundary`
- `Risk`
- `Rollback`

This payload is attached server-side and rendered in both chat approval cards and tool-approval queue views.

## Config Source

Runtime model configuration is stored in:

- `config/aika_operating_model.json`

## Runtime Integration

Primary runtime integration points:

- `apps/server/src/aika/intentProtocol.js`
- `apps/server/src/aika/laneExecutor.js`
- `apps/server/src/aika/commandRouter.js`
- `apps/server/src/aika/boot.js`

Lane dispatch behavior:

- Deterministic web intent with URL: routes to `action.run` (async) with a minimal safe plan (`goto` + `extractText`).
- Deterministic web intent without URL: routes to `web.search`.
- Workflow web intent: routes to `action.run` (async) with screenshot + text extraction.
- Desktop intent: routes to `desktop.run` (async) with approval-gated probe action.
- Code/orchestration intents remain module-driven.

Skill + approval integration points:

- `apps/server/src/aika/workflowSkills.js`
- `apps/server/src/aika/commandRouter.js`
- `apps/server/mcp/approvals.js`
- `apps/server/mcp/executor.js`
- `apps/web/pages/index.jsx`

Operator verification runbook:

- `docs/OPERATIONS_ROLLOUT.md`
- `scripts/verify_rollout_completion.ps1`
