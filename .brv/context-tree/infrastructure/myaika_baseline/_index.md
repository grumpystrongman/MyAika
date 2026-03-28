---
children_hash: 26700ac1ff9a5cda8f9e10a41d04f6c226c4f06986006a92c1b7298f03fff3b0
compression_ratio: 0.48851269649334944
condensation_order: 1
covers: [daily_stack_bring_up_script.md, myaika_startup_baseline.md]
covers_token_total: 827
summary_level: d1
token_count: 404
type: summary
---
# MyAika Startup and Lifecycle Overview

This structural summary covers the environment baseline and operational automation for the MyAika platform as of March 2026.

## Environment Baseline
Refer to [MyAika Startup Baseline](myaika_startup_baseline.md) for full environmental configuration.

*   **Core Infrastructure**: Requires Docker 28.1.1 and Docker Compose 2.35.1. 
*   **Architecture**: Operates on an MCP-lite control plane managing a 38-module registry.
*   **Key Capabilities**:
    *   **Action Runner**: Utilizes Playwright for automated tasks.
    *   **Desktop Runner**: Configured specifically for Windows UI automation.
*   **Trust Boundaries**: Includes host Windows, Docker runtime, WSL2, and external SaaS integrations.

## Lifecycle Automation
Refer to [Daily Stack Bring-up Script](daily_stack_bring_up_script.md) for specific execution flows and verification logic.

*   **Management Script**: `scripts/daily_up_verify.ps1` orchestrates the stack lifecycle.
*   **Operational Flow**:
    1.  Executes `docker compose up` using defined profiles.
    2.  Waits for critical services—`aika-shell`, `mcp-worker`, and `web-ui`—to reach a ready state (default 180s timeout).
    3.  Triggers `verify_core_stack.ps1` to ensure system integrity.
*   **Resiliency Protocols**:
    *   **Health Checks**: Defaults to 'healthy' status, with fallback to 'running' if health checks are undefined.
    *   **Parameter Handling**: Automatically retries verification if URL parameters mismatch.
    *   **Recovery**: Provides explicit rollback guidance, including options to execute `compose down` on failure.