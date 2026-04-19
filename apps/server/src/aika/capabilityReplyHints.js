function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function uniq(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function mapActionTypeToCapability(actionType = "") {
  const normalized = normalize(actionType).toLowerCase();
  if (normalized === "email.send") return "email";
  if (normalized === "calendar.proposehold") return "calendar";
  if (normalized === "messaging.telegramsend") return "telegram";
  if (normalized === "messaging.whatsapp.send") return "whatsapp";
  if (normalized === "messaging.sms.send") return "sms";
  return "";
}

function mapToolNameToCapability(toolName = "") {
  const normalized = normalize(toolName).toLowerCase();
  if (normalized.includes("telegram")) return "telegram";
  if (normalized.includes("whatsapp")) return "whatsapp";
  if (normalized.includes("sms") || normalized.includes("messages")) return "sms";
  if (normalized.includes("email")) return "email";
  if (normalized.includes("calendar")) return "calendar";
  if (normalized.includes("weather")) return "weather";
  if (normalized.includes("search")) return "search";
  return "";
}

export function deriveReplyCapabilities(extra = {}) {
  const result = new Set();
  for (const capability of Array.isArray(extra?.capabilities) ? extra.capabilities : []) result.add(capability);
  for (const capability of Array.isArray(extra?.orchestration?.capabilities) ? extra.orchestration.capabilities : []) result.add(capability);
  for (const item of Array.isArray(extra?.orchestration?.items) ? extra.orchestration.items : []) {
    if (item?.kind === "execution") {
      const mapped = mapActionTypeToCapability(item.actionType);
      if (mapped) result.add(mapped);
    }
    for (const capability of Array.isArray(item?.capabilities) ? item.capabilities : []) result.add(capability);
  }
  for (const action of Array.isArray(extra?.orchestration?.actions) ? extra.orchestration.actions : []) {
    const mapped = mapActionTypeToCapability(action?.actionType);
    if (mapped) result.add(mapped);
  }
  const extraAction = mapActionTypeToCapability(extra?.action?.type);
  if (extraAction) result.add(extraAction);
  const singleTool = mapToolNameToCapability(extra?.tool || "");
  if (singleTool) result.add(singleTool);
  for (const approval of Array.isArray(extra?.approvals) ? extra.approvals : []) {
    const mapped = mapToolNameToCapability(approval?.toolName || approval?.approvalContext?.tool || "");
    if (mapped) result.add(mapped);
  }
  const singleApproval = mapToolNameToCapability(extra?.approval?.toolName || extra?.approval?.approvalContext?.tool || "");
  if (singleApproval) result.add(singleApproval);
  if (extra?.inbox) result.add("email");
  if (extra?.calendar) result.add("calendar");
  return uniq(Array.from(result));
}

export function buildReplyCapabilityHints(capabilities = [], snapshot = {}) {
  const hints = [];
  for (const capability of uniq(capabilities)) {
    if (capability === "email") {
      hints.push(snapshot.emailReady
        ? { id: "email", ready: true, line: "Email is connected and available." }
        : { id: "email", ready: false, line: "Email is not connected yet. Connect Gmail or Outlook in Settings -> Connections before I can act on mail." });
      continue;
    }
    if (capability === "calendar") {
      hints.push(snapshot.calendarReady
        ? { id: "calendar", ready: true, line: "Calendar is connected and available." }
        : { id: "calendar", ready: false, line: "Calendar is not connected yet. Connect Google or Microsoft calendar in Settings -> Connections before I can schedule or review events." });
      continue;
    }
    if (capability === "weather") {
      hints.push(snapshot.weatherReady
        ? { id: "weather", ready: true, line: "Weather is available." }
        : { id: "weather", ready: false, line: "Weather is unavailable right now because the server is not ready." });
      continue;
    }
    if (capability === "search") {
      hints.push(snapshot.searchReady
        ? { id: "search", ready: true, line: "Web and chat search are available." }
        : { id: "search", ready: false, line: "Search is unavailable right now because the search backend is not configured." });
      continue;
    }
    if (capability === "telegram") {
      hints.push(snapshot.telegramReady
        ? { id: "telegram", ready: true, line: "Telegram is connected and ready for message delivery." }
        : { id: "telegram", ready: false, line: "Telegram is not connected yet. I can stage the action flow, but delivery needs Telegram setup first." });
      continue;
    }
    if (capability === "whatsapp") {
      hints.push(snapshot.whatsappReady
        ? { id: "whatsapp", ready: true, line: "WhatsApp is connected and ready for message delivery." }
        : { id: "whatsapp", ready: false, line: "WhatsApp is not connected yet. I can stage the action flow, but delivery needs WhatsApp setup first." });
      continue;
    }
    if (capability === "sms") {
      hints.push(snapshot.smsReady
        ? { id: "sms", ready: true, line: "SMS is connected and ready for message delivery." }
        : { id: "sms", ready: false, line: "SMS is not connected yet. I can stage the action flow, but delivery needs SMS setup first." });
      continue;
    }
  }
  return hints;
}

export function appendCapabilityHintsToReply(text = "", extra = {}, snapshot = {}) {
  const capabilities = deriveReplyCapabilities(extra);
  if (!capabilities.length) return { text, capabilityHints: [] };
  const hints = buildReplyCapabilityHints(capabilities, snapshot);
  if (!hints.length) return { text, capabilityHints: [] };
  const shouldInclude =
    capabilities.length > 1 ||
    hints.some(hint => !hint.ready) ||
    capabilities.some(capability => ["email", "calendar", "telegram", "whatsapp", "sms"].includes(capability));
  if (!shouldInclude) {
    return { text, capabilityHints: hints };
  }
  const block = `Capability status\n${hints.map(hint => `- ${hint.line}`).join("\n")}`;
  const base = normalize(text);
  return {
    text: base ? `${base}\n\n${block}` : block,
    capabilityHints: hints
  };
}
