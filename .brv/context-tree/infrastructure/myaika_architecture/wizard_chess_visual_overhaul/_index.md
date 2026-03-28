---
children_hash: 6297a1808dbae1afe9a0c88dc713a0fa33a31ccd14e60ddcb6e7bc0b4b3f50ee
compression_ratio: 0.8418708240534521
condensation_order: 0
covers: [wizard_chess_visual_overhaul.md]
covers_token_total: 449
summary_level: d0
token_count: 378
type: summary
---
# Wizard Chess Visual Overhaul (d0)

This domain encompasses the visual and 3D combat integration for Wizard Chess, focusing on high-fidelity rendering and role-aware animation systems.

### Core Architecture and Integration
The system bridges 3D WebGL rendering (via `WizardArenaScene`) with state management (via `WizardChessPanel`). Asset generation for 10 distinct factions is handled by `scripts/generate_wizard_piece_svgs.mjs`, utilizing SVG-based piece styling stored at `apps/web/public/wizard-assets/pieces/`. The system includes a graceful degradation path for environments lacking WebGL support.

### Combat and Animation Flow
The combat workflow follows a structured sequence: 
Battle Cue → `resolveArmyBattleProfile` → `resolveBattleCue` → Animation Execution → Voice Synthesis.

*   **Animation Engine**: Utilizes GSAP with smoothStep easing for combat timelines.
*   **Combat Cues**: Supported cues include thrust, slash, prayer, smash, cast, and command.
*   **Voice Synthesis**: Mandatory constraints for voice output include pitch range (0.85–1.35) and rate (0.85–1.2).

### Key Constraints and Conventions
*   **Asset Naming**: Assets must adhere to the `--wizard-piece-{color}-{piece}` convention.
*   **Technical Stack**: Requires THREE.js for 3D rendering, GSAP for motion, and the Web SpeechSynthesis API for audio feedback.

Refer to `wizard_chess_visual_overhaul.md` for full implementation details, faction-specific asset definitions, and the complete battle profile resolution logic.