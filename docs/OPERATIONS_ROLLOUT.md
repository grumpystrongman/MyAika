# AIKA Operations Rollout

This runbook operationalizes a Docker-first layout for MyAika while preserving explicit trust boundaries and approval controls.

## Service Layout

Primary compose file:
- `docker-compose.aika-stack.yml`

Service lanes:
- `aika-shell`: OpenClaw/Codex personality + API control surface.
- `mcp-worker`: background execution lane for queued work.
- `web-ui`: operator UI lane.
- `agent-browser`: deterministic browser lane with trust-zoned profile volumes.
- `skyvern-lane` (optional profile): workflow browser lane scaffold.
- `opik-lane` (optional profile): observability lane scaffold.

Persistent volumes:
- `aika_data`, `aika_server_data`
- `browser_low_trust`, `browser_work_trust`, `browser_high_trust`
- `skyvern_data`, `opik_data`

## Startup Modes

Daily mode (core runtime):
```powershell
docker compose -f docker-compose.aika-stack.yml --profile daily up -d --build
```

One-command daily up + verification:
```powershell
npm run stack:daily
```

Fast path (no rebuild):
```powershell
npm run stack:daily:nobuild
```

Port mapping:
- Host API port defaults to `8790` (`AIKA_HOST_PORT`), mapped to container `8787`.

Test mode (includes deterministic browser lane):
```powershell
docker compose -f docker-compose.aika-stack.yml --profile test up -d --build
```

Experimental mode (includes optional lanes):
```powershell
docker compose -f docker-compose.aika-stack.yml --profile experimental up -d --build
```

Stop:
```powershell
docker compose -f docker-compose.aika-stack.yml down
```

## Verification

Run non-destructive verification:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_core_stack.ps1
```

Repo shortcut:
```powershell
npm run verify:core
```

Full tranche/cohort verification (runtime + policy + skill dispatch + module registry + web build + UI cohorts):
```powershell
npm run verify:rollout
```

Verifier includes:
- compose service-state checks for `aika-shell`, `mcp-worker`, `web-ui`
- web endpoint check (`http://127.0.0.1:3000` by default)
- warning if `web-ui` logs show runtime dependency bootstrap markers

Offline/compose-only verification:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_core_stack.ps1 -SkipApi
```

Optional stateful write check (digest generation path):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_core_stack.ps1 -IncludeWriteChecks
```

## Trust Boundary Rules

- Host edits stay repo-scoped by default.
- Containerized services write only to named volumes and configured mounts.
- Browser profiles are separated by trust level:
  - `low_trust`
  - `work_trust`
  - `high_trust`
- External writes remain approval-gated via MCP-lite.
- Mode policy details: `docs/TRUST_BOUNDARY_MODES.md`.

## Optional Skyvern and Opik Lanes

`skyvern-lane` and `opik-lane` are profile-gated scaffolds by design:
- They are disabled in daily mode.
- They require environment-specific image/env configuration before production use.
- Use them only after core lane stability is verified.

## Rollback

If rollout checks fail:
1. `docker compose -f docker-compose.aika-stack.yml down`
2. Revert to baseline runtime:
   - `docker compose up --build` (legacy compose)
3. Re-run:
   - `powershell -ExecutionPolicy Bypass -File scripts/verify_core_stack.ps1 -SkipApi`
4. Fix configuration drift, then restart targeted profile.
