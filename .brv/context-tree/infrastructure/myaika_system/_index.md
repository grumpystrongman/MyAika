---
children_hash: 1ea4ac6b27131a6c6b54b740ffd77a9f053b71950634ff92972ca4f3ee45babf
compression_ratio: 0.8524590163934426
condensation_order: 1
covers: [aika_system_configuration.md]
covers_token_total: 305
summary_level: d1
token_count: 260
type: summary
---
# Aika System Configuration Overview

The Aika system configuration manages the core interaction state, including UI preferences, emotion-tuned TTS output, and approval workflows. This configuration is primarily defined across `apps/server/index.js` and `apps/server/memory.js`.

## Key Architectural Components
*   **UI/Chat Interface:** Manages tab persistence and approval state synchronization via the `performApprovalAction` helper.
*   **TTS Engine:** Utilizes the Piper TTS engine with dynamic voice parameter adjustments (rate, pitch, energy, and pauses) based on detected system moods.

## Operational Rules & Defaults
*   **Emotion Tuning:** The default intensity is set to 0.35. Mood-based adjustments are applied to output (e.g., Happy mood increases rate by 0.08 and pitch by 0.6).
*   **Text Processing:** TTS text chunking merges segments shorter than 40 characters.
*   **UI Defaults:** The system defaults to the 'chat' UI tab.

For granular implementation details, refer to the source file: `aika_system_configuration.md`.