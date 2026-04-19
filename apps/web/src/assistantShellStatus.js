function normalizeConnection(entry) {
  return {
    connected: Boolean(entry?.connected),
    configured: Boolean(entry?.configured)
  };
}

function pickConnection(integrations = {}, keys = []) {
  return keys.map((key) => normalizeConnection(integrations?.[key])).some((entry) => entry.connected || entry.configured);
}

function buildCapability(id, label, ready, detail, action = null) {
  return {
    id,
    label,
    state: ready ? "ready" : "attention",
    detail,
    action
  };
}

export function buildAssistantShellCapabilities({ integrations = {}, statusInfo = null } = {}) {
  const voiceReady = Boolean(
    statusInfo?.tts?.engines?.openai?.configured ||
    statusInfo?.tts?.engines?.gptsovits?.online ||
    statusInfo?.tts?.engines?.piper?.ready
  );
  const emailReady = pickConnection(integrations, ["gmail", "outlook", "microsoft"]);
  const calendarReady = pickConnection(integrations, ["google_docs", "outlook", "microsoft"]);
  const searchReady = Boolean(statusInfo?.server?.ok && statusInfo?.openai?.configured);
  const weatherReady = Boolean(statusInfo?.server?.ok);
  const telegramReady = pickConnection(integrations, ["telegram"]);
  const whatsappReady = pickConnection(integrations, ["whatsapp"]);
  const smsReady = pickConnection(integrations, ["messages"]);

  return [
    buildCapability("voice", "Voice", voiceReady, voiceReady ? `Ready (${statusInfo?.tts?.selected || "default"})` : "Voice pipeline needs setup", "voice"),
    buildCapability("email", "Email", emailReady, emailReady ? "Connected" : "Connect Gmail or Outlook", "connections"),
    buildCapability("calendar", "Calendar", calendarReady, calendarReady ? "Connected" : "Connect Google or Microsoft calendar", "connections"),
    buildCapability("weather", "Weather", weatherReady, weatherReady ? "Available" : "Server offline", null),
    buildCapability("search", "Search", searchReady, searchReady ? "Web + Chat search available" : "Search unavailable", null),
    buildCapability("telegram", "Telegram", telegramReady, telegramReady ? "Connected" : "Not connected", "connections"),
    buildCapability("whatsapp", "WhatsApp", whatsappReady, whatsappReady ? "Connected" : "Not connected", "connections"),
    buildCapability("sms", "SMS", smsReady, smsReady ? "Connected" : "Not connected", "connections")
  ];
}

export function summarizePendingApprovals(approvals = [], limit = 3) {
  const actionable = approvals
    .filter((approval) => {
      const status = String(approval?.status || "").toLowerCase();
      return status === "pending" || status === "approved";
    })
    .sort((a, b) => {
      const aTime = Date.parse(a?.createdAt || 0) || 0;
      const bTime = Date.parse(b?.createdAt || 0) || 0;
      return bTime - aTime;
    });

  const byRisk = actionable.reduce((acc, approval) => {
    const risk = String(approval?.riskLevel || approval?.approvalContext?.risk || "unknown").toLowerCase();
    acc[risk] = (acc[risk] || 0) + 1;
    return acc;
  }, {});

  return {
    total: actionable.length,
    highRisk: (byRisk.high || 0) + (byRisk.critical || 0),
    mediumRisk: byRisk.medium || 0,
    lowRisk: byRisk.low || 0,
    items: actionable.slice(0, limit).map((approval) => ({
      id: approval.id,
      toolName: approval.toolName || approval.approvalContext?.tool || "tool",
      riskLevel: String(approval?.riskLevel || approval?.approvalContext?.risk || "unknown").toLowerCase(),
      humanSummary: approval.humanSummary || approval.approvalContext?.action || approval.toolName || "Approval needed",
      status: approval.status,
      createdAt: approval.createdAt,
      token: approval.token || "",
      approvalContext: approval.approvalContext || null
    }))
  };
}
