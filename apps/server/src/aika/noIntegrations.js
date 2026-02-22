const PREFIX_MAP = [
  { prefix: "EMAIL:", moduleId: "drafting_factory", label: "Email" },
  { prefix: "CALENDAR EXPORT:", moduleId: "calendar_hygiene", label: "Calendar" },
  { prefix: "KPI SNAPSHOT:", moduleId: "kpi_drift_anomaly_watch", label: "KPI Snapshot" },
  { prefix: "PROJECT STATUS:", moduleId: "risk_radar", label: "Project Status" },
  { prefix: "NOTE:", moduleId: "quick_summaries", label: "Note" }
];

export function parseStructuredPrefix(text = "") {
  const raw = String(text || "");
  const match = PREFIX_MAP.find(entry => raw.toUpperCase().startsWith(entry.prefix));
  if (!match) return null;
  const payload = raw.slice(match.prefix.length).trim();
  return {
    type: match.label,
    moduleId: match.moduleId,
    payload
  };
}

export function buildNoIntegrationInput(parsed) {
  if (!parsed) return null;
  return {
    context_text: parsed.payload,
    structured_input: { source_type: parsed.type },
    attachments: [],
    options: { no_integrations: true }
  };
}
