---
children_hash: b019158290573132cf5036a3b64ce57eab40e8a59e8d0fda97cdb13d1a457f36
compression_ratio: 0.7294429708222812
condensation_order: 1
covers: [web_interface/_index.md]
covers_token_total: 377
summary_level: d1
token_count: 275
type: summary
---
# Web Interface Configuration Overview

The web interface acts as the primary hub for assistant interaction, UI state, and theme management, bridging server-side configurations with the client-side experience. Central logic resides in `apps/web/pages/index.jsx`.

### Architectural Management
* **Initialization Flow**: Server URL resolution (prioritizing `NEXT_PUBLIC_SERVER_URL`), followed by theme and avatar initialization.
* **State Synchronization**: Managed via React hooks, featuring a dedicated polling loop for real-time approval status updates.
* **Operational Constraints**: 
    * **TTS Chunking**: Text segments are limited to 180 characters via `splitSpeechText`.
    * **Persistence**: Preference updates are debounced by 500ms.
    * **Audio Processing**: Web Audio API integration includes emotion-based tuning (e.g., "Happy" mode applies +0.08 rate and +0.6 pitch modifiers).

### Key Integrations
* **API Endpoints**: `/api/approvals` for synchronization and `/api/assistant/profile` for state persistence.

For implementation specifics, refer to `web_interface_configuration.md`.