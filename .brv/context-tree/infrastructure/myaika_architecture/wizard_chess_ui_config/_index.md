---
children_hash: 8b04dfe195d103598323eb9b2c01e715316a4abc914726517c0e1eb7ce5b7059
compression_ratio: 0.8588235294117647
condensation_order: 0
covers: [wizard_chess_ui_configuration.md]
covers_token_total: 425
summary_level: d0
token_count: 365
type: summary
---
# Wizard Chess UI Configuration Summary

This entry covers the runtime reliability and UI configuration for the Wizard Chess module. It focuses on robust engine communication and UI stability.

## Architectural Overview
The system employs a multi-port engine fallback strategy to ensure connectivity with local AIKA servers. The communication flow is: `buildEngineServerCandidates` → `resolveServerUrl` → `postEngineRequest` → `validate Response` → `process chess move`.

### Key Technical Details
- **Engine Fallback:** Iterates through ports 8790, 8791, and 8787 using both `127.0.0.1` and `localhost` addresses.
- **Reliability:** Implements defensive response parsing; raw text is validated before attempting `JSON.parse()` to prevent runtime crashes.
- **UI Persistence:** Utilizes `localStorage` v2 for configuration state.
- **Dependencies:** Relies on Chessground (rendering), GSAP (battle effects), and ResizeObserver (responsiveness).

### Configuration Parameters
- **Speech Synthesis:** Debounce set to 1200ms; rate (0.85-1.2), pitch (0.85-1.35), and volume (0.95).
- **Battle Effects:** Intensity scales between 0.4 and 1.35 upon piece capture.

### Operational Rules
1. **Validation:** All engine responses must be parsed as raw text before JSON validation.
2. **Move Validation:** Chess moves must conform to the regex `/^[a-h][1-8][a-h][1-8][qrbn]?$/`.

For further details, refer to the full documentation in `wizard_chess_ui_configuration.md`.