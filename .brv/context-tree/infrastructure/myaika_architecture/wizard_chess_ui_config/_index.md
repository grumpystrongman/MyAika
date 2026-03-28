---
children_hash: 5b7b71673ed3628d64d5a8ec0ef5de47ab70237b45a0d9c662a42e4f8860c6cc
compression_ratio: 0.9330024813895782
condensation_order: 0
covers: [wizard_chess_ui_configuration.md]
covers_token_total: 403
summary_level: d0
token_count: 376
type: summary
---
# Wizard Chess UI Configuration Summary

This entry outlines the configuration and integration architecture for the Wizard Chess UI, centered on the `WizardChessPanel` and `WizardArenaScene` components.

### Architectural Overview
The system relies on a three-tier dependency stack: `three.js` (3D rendering), `gsap` (animations), and `chess.js` (engine logic). Integration requires the Next.js dev server to be bound explicitly to `127.0.0.1:3105`.

### Key Operational Flows
*   **Initialization:** UI hydration followed by arena scene setup and WebGL context monitoring.
*   **Move Processing:** Standardized UCI-compliant engine move parsing, including mandatory promotion normalization for `chess.js` compatibility.
*   **Resiliency:** A WebGL-safe fallback mechanism triggers a static CSS overlay if context loss occurs, preventing white-screen loops.

### Configuration & Persistence
*   **Persistence:** User preferences are managed via `localStorage` using the key `aika_wizard_chess_ui_v2`.
*   **Engine API:** Communication with the engine occurs via `127.0.0.1:8790/api/chess/engine-move`.

### Mandatory Rules
1.  **Fallback Trigger:** WebGL context loss must immediately initiate the CSS overlay.
2.  **Environment:** Next.js must operate on port `3105`.
3.  **Data Format:** Pawn promotion suffixes are strictly required for engine compatibility.

For further implementation details and specific engine integration logic, refer to the full `wizard_chess_ui_configuration.md` documentation.