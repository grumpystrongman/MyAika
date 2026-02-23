# Health Integration Prep

This document captures the prep work for bringing Apple Health and Epic/MyChart data into Aika and a future Health RAG collection. It focuses on scaffolding, safety, and data flow design so we can implement connectors in a controlled, auditable way.

## Goals
- Consolidate personal health data into a dedicated Health RAG collection.
- Keep PHI secured, least-privilege, and auditable.
- Make integrations modular with clear inputs, outputs, and update policies.

## Planned Sources
1. Apple Health companion export (file import + companion app)
2. Epic/MyChart (FHIR/SMART OAuth, Duke Health)

## Current Prep Work (Implemented)
- Added Health source registry in `apps/server/src/health/sources.js`.
- Added environment variable placeholders in `apps/server/.env.example`.
- Captured this integration plan for future build-out.
- Added a Health ingest endpoint for companion uploads in `apps/server/src/health/ingest.js`.

## Data Flow (Target)
1. **Ingest**: connector pulls or imports source data.
2. **Normalize**: map raw fields to a common health schema.
3. **Tag & Classify**: `source`, `record_type`, `timestamp`, `confidence`, `phi_level`.
4. **Store**: write to a dedicated Health RAG collection (separate from general memory).
5. **Summarize**: periodic health summaries and trends (opt-in).

## Safety + Compliance
- Treat all health data as PHI.
- Keep encryption enabled (`memory_vault.key`) and avoid plaintext storage.
- Minimize retention and provide export/delete paths.
- Require explicit confirmation for any outbound sharing.

## Next Implementation Steps
1. **Apple Health**
   - Use the companion app to POST health records into `/api/health/ingest`.
   - Add an import endpoint for Apple Health export archives.
   - Parse records into normalized time-series entries.
2. **Epic/MyChart**
   - Add SMART-on-FHIR OAuth flow (Duke Health / Epic).
   - Pull patient-scoped resources into Health RAG.

## Companion Upload (Draft Payload)
```
POST /api/health/ingest
Headers: x-health-token: <HEALTH_COMPANION_TOKEN>
Body:
{
  "source": "apple_health",
  "records": [
    {
      "title": "Heart Rate Sample",
      "text": "Resting HR 62 bpm",
      "recordType": "heart_rate",
      "timestamp": "2026-02-23T14:32:00Z",
      "tags": ["wearable", "daily"],
      "metadata": { "unit": "bpm" }
    }
  ]
}
```

## Duke Health (Epic/MyChart) Notes
- We’ll need the Duke Health SMART-on-FHIR base URL and client credentials.
- Once provided, we can wire the OAuth flow and pick the FHIR resources to ingest.

## Open Questions
- How frequently should health data be synced?
- Which FHIR resources are most valuable for your use cases?
