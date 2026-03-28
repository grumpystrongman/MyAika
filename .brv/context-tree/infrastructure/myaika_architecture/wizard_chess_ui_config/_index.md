---
children_hash: 99dd32fd2b9aa25e8de47bbc0036f1bbed561103490f3f4005591434f4f78463
compression_ratio: 0.7619047619047619
condensation_order: 0
covers: [wizard_chess_ui_configuration.md]
covers_token_total: 378
summary_level: d0
token_count: 288
type: summary
---
# Wizard Chess UI Configuration Summary

This entry details the architectural resolution of white-screen and infinite load issues within the Wizard Chess interface, primarily caused by cache corruption in Windows/OneDrive development environments.

## Architectural Decisions
- **Build Artifact Isolation:** Implemented per-instance Next.js build directory isolation.
- **Environment Configuration:** 
    - Development instances utilize `.next-wizard-<port>` via `scripts/start_wizard_chess_dev.ps1`.
    - Verification cohorts utilize `.next-rollout-<port>` via `scripts/verify_rollout_completion.ps1`.
- **Cache Management:** Disabled Webpack filesystem cache in development mode to prevent intermittent restore warnings.

## Key Implementation Details
- **Next.js Config:** `apps/web/next.config.mjs` dynamically reads `NEXT_DIST_DIR` to set the build output path.
- **Rules:** 
    1. Mandatory use of `NEXT_DIST_DIR` for all isolated instances.
    2. Strict adherence to port-based naming conventions for build directories.

For detailed configuration logic and environment variable implementation, refer to `wizard_chess_ui_configuration.md`.