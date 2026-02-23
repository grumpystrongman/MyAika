export const HEALTH_SOURCES = [
  {
    id: "apple_health_export",
    label: "Apple Health Export",
    type: "file_import",
    status: "planned",
    notes: "Import the Apple Health export archive or companion upload and normalize records."
  },
  {
    id: "epic_fhir",
    label: "Epic / MyChart (FHIR)",
    type: "fhir",
    status: "planned",
    notes: "SMART-on-FHIR OAuth with patient-scoped read access (Duke Health / Epic)."
  }
];

export function listHealthSources() {
  return HEALTH_SOURCES.map(source => ({ ...source }));
}
