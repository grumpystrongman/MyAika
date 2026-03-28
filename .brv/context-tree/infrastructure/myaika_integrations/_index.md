---
children_hash: 95f44a6f4046b6ec7ebf4abc0af80ff1593243551cce78b422468e83bf0c64c6
compression_ratio: 0.8071748878923767
condensation_order: 1
covers: [myaika_integrations.md]
covers_token_total: 223
summary_level: d1
token_count: 180
type: summary
---
# MyAika Integrations Summary

MyAika utilizes MCP-lite patterns to manage extensibility across services located in `apps/server/integrations`.

## Core Capabilities
- **Supported Integrations:** Google Docs/Drive, Fireflies, Telegram, and Amazon Research.
- **Workflow:** OAuth -> Service Auth -> Endpoint Execution -> Memory Storage.

## Technical Details
- **Authentication:** Google suite integrations require OAuth.
- **Data Persistence:** Telegram integration leverages SQLite for thread-based memory management.
- **Pattern:** Implements MCP-lite for extensible integration hooks; Telegram webhooks process at `POST /api/integrations/telegram/webhook`.

*For expanded details, refer to `myaika_integrations.md`.*