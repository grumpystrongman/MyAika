# Trust Boundary Modes

This document defines the operating modes used in MyAika when actions may cross trust boundaries between the host, Docker containers, sandboxed execution, VM/WSL, and external systems.

Use this as an operator control policy, not as product guidance.

## Scope

Applies to:
- Local host: Windows workstation, local file system, secrets, installed tools, and user sessions.
- VM/WSL: isolated runtime used for heavier or riskier local operations.
- Docker containers: app, worker, and support services.
- Sandbox: constrained execution inside browser automation, action runners, or test harnesses.
- External systems: email, calendar, chat, SaaS APIs, data platforms, and third-party services.

Principles:
- Lowest privilege first.
- One boundary crossing per approval.
- Draft before send when the target is external.
- Log every privileged action.
- Prefer rollback-ready changes over ad hoc fixes.

## Trust Boundary Map

### Host
Highest local trust. Contains user files, credentials, and system-level utilities.

Allowed:
- Edit repository files.
- Inspect logs, configs, and artifacts.
- Run local developer tools that stay inside the repo.

Approval required:
- System-wide configuration changes.
- Credential changes.
- File operations outside the repo or user-approved workspace.
- Any destructive local action.

Prohibited:
- Unreviewed deletion or overwrite of user data.
- Silent credential export.
- Running untrusted binaries with host access.

### VM / WSL
Isolated local execution boundary for heavier work.

Allowed:
- Build, test, and run disposable workloads.
- Use temporary files and throwaway services.
- Apply dependency or environment changes that stay inside the VM/WSL boundary.

Approval required:
- Network egress changes.
- Mounting host paths with write access.
- Any action that would persist outside the VM/WSL without review.

Prohibited:
- Treating VM state as durable source of truth unless explicitly promoted.
- Direct secret handling without redaction and storage classification.

### Docker Containers
Primary application runtime boundary.

Allowed:
- Start, stop, and restart containers.
- Rebuild images from known sources.
- Run app-level tests, migrations, and health checks.
- Write only to intended mounted volumes.

Approval required:
- Recreating services that may cause data loss.
- Changing exposed ports, volumes, or container privileges.
- Modifying images used in production-like environments.

Prohibited:
- Granting `--privileged` or equivalent without explicit approval.
- Mounting arbitrary host paths.
- Using containers as a shortcut to reach host credentials or host-only files.

### Sandbox
Constrained execution boundary for automation, browser actions, and scripted UI work.

Allowed:
- Read-only inspection.
- Non-destructive UI interaction.
- Generating drafts, screenshots, and test artifacts.

Approval required:
- Any action that submits forms, writes remote state, or triggers side effects.
- Any action that may create, delete, or publish records.

Prohibited:
- Exfiltrating secrets from sandboxed context.
- Using sandbox output as proof of external success without confirmation from the target system.

### External Systems
Outside the local trust boundary.

Allowed:
- Read-only queries against approved systems.
- Draft creation without sending or publishing.
- Safe idempotent lookups when the target system supports them.

Approval required:
- Sending email or chat.
- Calendar creation or editing, especially with attendees.
- Publishing, deleting, purchasing, or provisioning.
- Any action that changes records, permissions, billing, or access.

Prohibited:
- Irreversible actions without explicit approval.
- Cross-system credential reuse.
- Bulk writes that exceed the approved scope.

## Operating Modes

### WORK
Default mode for normal development and operations.

Use when:
- Editing repo files.
- Running local tests.
- Reading logs and inspecting state.
- Preparing drafts for later approval.

Allowed actions:
- Host: repo-scoped edits, non-destructive inspection, local tests.
- VM / WSL: disposable builds and tests.
- Docker: start/stop non-production containers, rebuild local images.
- Sandbox: read-only or local-only interactions.
- External systems: read-only queries and draft creation only.

Approval required:
- Any boundary crossing that writes to a higher-trust layer.
- Any external write.
- Any destructive or irreversible action.

Prohibited:
- Host-level system changes.
- Production-like writes.
- Unbounded automation that can escape the current task scope.

### ELEVATED
Temporary mode for a defined task that must cross one or more boundaries.

Use when:
- A normal WORK action is blocked by trust boundaries.
- A task requires a controlled write to Docker, VM, host, or an external system.
- You need to repair or validate a privileged path.

Allowed actions:
- Targeted host changes with a scoped rollback plan.
- Container or VM changes that require extra trust.
- External writes only when the exact destination and payload are approved.

Approval required:
- Explicit operator approval before entering ELEVATED.
- A written scope that names the boundary being crossed.
- A rollback plan for every write.

Prohibited:
- Open-ended privilege escalation.
- Multiple unrelated boundary crossings in one approval.
- Reusing ELEVATED for follow-on work outside the approved scope.

### MAINTENANCE WINDOW
Time-boxed high-trust mode for planned operational change.

Use when:
- Performing upgrades, migrations, rotations, or recovery.
- Making coordinated changes across host, containers, VM/WSL, or external systems.
- Executing a runbook with a defined start, end, and rollback point.

Allowed actions:
- Stop/start services in a controlled sequence.
- Apply schema, dependency, or config changes.
- Rotate secrets and tokens.
- Coordinate changes across systems when required by the runbook.

Approval required:
- Start of window.
- Any change that affects data, credentials, access, or uptime.
- Any deviation from the documented runbook.

Prohibited:
- Ad hoc scope expansion.
- Permanent changes without documented rollback.
- Continuing past the approved window without re-approval.

## Boundary Crossing Rules

1. Do not cross a boundary unless the target mode permits it and the action has a clear owner, scope, and rollback path.
2. Cross only the minimum necessary boundary.
3. Prefer read-only verification before write actions.
4. Draft external actions before execution whenever the system supports it.
5. Host access is never assumed from container, sandbox, or VM access.
6. Docker write access does not imply host write access.
7. Sandbox success does not equal external success; confirm in the external system.
8. Any move from lower trust to higher trust requires explicit approval.
9. If the action would touch more than one boundary, treat it as a maintenance-window candidate.
10. If rollback is unclear, do not proceed.

## Rollback and Recovery Expectations

Every privileged action must define:
- What changes.
- How to verify success.
- How to revert.
- Who owns the revert.

Recovery standards:
- Prefer reversible changes: config toggles, feature flags, temporary permissions, disposable containers.
- Capture pre-change state when practical: snapshots, exports, backups, or diffs.
- If the change fails, stop further automation and return to the last known good state.
- If rollback cannot restore service or data integrity, escalate immediately and preserve evidence.
- After recovery, record the incident, root cause, and follow-up action.

Minimum artifacts for recovery:
- Pre-change checkpoint or backup reference.
- Change log with timestamp.
- Validation evidence.
- Revert command or procedure.

## Approval Request Template

Use this format for any action that crosses a trust boundary:

```text
Request: <action>
Mode: WORK | ELEVATED | MAINTENANCE WINDOW
From: <current boundary>
To: <target boundary>
Why: <business or operational reason>
Scope: <exact systems, files, services, or records>
Risk: <what could fail or be lost>
Rollback: <how to revert>
Validation: <how success will be confirmed>
Timebox: <start/end or duration>
Owner: <person or role>
Approval needed: <yes/no, from whom>
```

## Operator Defaults

- Default to WORK.
- Escalate to ELEVATED only for a single, named task.
- Use MAINTENANCE WINDOW for coordinated change, recovery, or anything with downtime risk.
- If an action is irreversible, require explicit approval even inside MAINTENANCE WINDOW.
- If a system cannot confirm success, treat the action as unverified.
