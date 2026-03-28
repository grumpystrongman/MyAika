---
children_hash: 9059820e6f261acd8c703aaabe4d14286e721df0cbfeabc29efb5f4ca5eb3efe
compression_ratio: 0.7679012345679013
condensation_order: 0
covers: [web_interface_configuration.md]
covers_token_total: 405
summary_level: d0
token_count: 311
type: summary
---
# Web Interface Configuration Summary

The web interface, primarily defined in `apps/web/pages/index.jsx`, serves as the central hub for UI state, assistant interaction, and theme management. It bridges the gap between server-side configuration and client-side user experience.

### Architectural Flow and Management
The system initializes by resolving the server URL, followed by theme and avatar loading. State is maintained via React hooks, with a recently added polling loop ensuring real-time approval status synchronization.

### Key Operational Rules
- **Server Resolution**: Prioritize `process.env.NEXT_PUBLIC_SERVER_URL` before falling back to `window.location.origin`.
- **TTS Chunking**: Use `splitSpeechText` to limit chunks to a maximum of 180 characters.
- **Persistence**: Debounce preference persistence updates by 500ms.

### Dependencies and Integration
- **API Endpoints**: Integrates with `/api/approvals` for status sync and `/api/assistant/profile` for persistence.
- **Audio/Visual**: Utilizes the Web Audio API for text-to-speech (TTS), incorporating emotion-based tuning (e.g., "Happy" mood adjusts rate by +0.08 and pitch by +0.6).

For comprehensive implementation details, refer to `web_interface_configuration.md`.