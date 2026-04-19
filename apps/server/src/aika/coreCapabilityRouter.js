function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function lower(text) {
  return normalize(text).toLowerCase();
}

function hasCapabilityCue(text, cues = []) {
  const l = lower(text);
  return cues.some((pattern) => pattern.test(l));
}

function extractSearchQuery(text = "") {
  const raw = normalize(text);
  let m = raw.match(/(?:google search|chatgpt search|search(?: the)? web for|look up|find online)\s+(.+)$/i);
  if (m?.[1]) return m[1].replace(/^for\s+/i, "").trim();
  m = raw.match(/^google\s+(.+)$/i);
  if (m?.[1]) return m[1].replace(/^for\s+/i, "").trim();
  m = raw.match(/^chatgpt\s+search\s+(.+)$/i);
  if (m?.[1]) return m[1].replace(/^for\s+/i, "").trim();
  return "";
}

export function parseCoreCapabilityRequest(text = "", options = {}) {
  const raw = normalize(text);
  if (!raw) return { actionable: false, capabilities: [] };
  const l = lower(raw);
  const allowSingle = Boolean(options?.allowSingle);

  const wantsEmail = hasCapabilityCue(l, [
    /\b(email|emails|inbox|mail|gmail|outlook)\b/,
    /\bcheck (?:my )?(?:email|emails|inbox|mail)\b/
  ]);
  const wantsCalendar = hasCapabilityCue(l, [
    /\b(calendar|schedule|events?|appointments?|meetings?)\b/,
    /\bcheck (?:my )?(?:calendar|schedule)\b/
  ]);
  const wantsWeather = hasCapabilityCue(l, [
    /\b(weather|forecast|temperature)\b/,
    /\bcheck (?:the )?weather\b/
  ]);
  const searchQuery = extractSearchQuery(raw);
  const wantsSearch = Boolean(searchQuery);

  const capabilities = [];
  if (wantsEmail) capabilities.push("email");
  if (wantsCalendar) capabilities.push("calendar");
  if (wantsWeather) capabilities.push("weather");
  if (wantsSearch) capabilities.push("search");

  const explicitAssistantInvocation = /\b(hey|hi|hello)\s+aika\b/i.test(raw) || /\baika[:,]?\b/i.test(raw);
  const actionable = capabilities.length > 1 || (explicitAssistantInvocation && capabilities.length >= 1) || (allowSingle && capabilities.length >= 1);

  return {
    actionable,
    capabilities,
    searchQuery
  };
}

function formatSection(title, body) {
  const text = normalize(body);
  if (!text) return "";
  return `${title}\n${text}`;
}

export async function executeCoreCapabilityRequest({
  text,
  userId,
  timezone,
  homeLocation = "",
  deps = {},
  options = {}
} = {}) {
  const parsed = parseCoreCapabilityRequest(text, options);
  if (!parsed.actionable) return { handled: false };

  const {
    handleEmail,
    handleCalendar,
    handleWeather,
    searchWeb
  } = deps;

  const results = [];
  const data = {};

  if (parsed.capabilities.includes("email") && typeof handleEmail === "function") {
    const emailResult = await handleEmail({ text, userId });
    results.push(formatSection("Inbox", emailResult?.text || "No inbox response available."));
    data.email = emailResult || null;
  }

  if (parsed.capabilities.includes("calendar") && typeof handleCalendar === "function") {
    const calendarResult = await handleCalendar({ text, userId, timezone });
    results.push(formatSection("Calendar", calendarResult?.text || "No calendar response available."));
    data.calendar = calendarResult || null;
  }

  if (parsed.capabilities.includes("weather") && typeof handleWeather === "function") {
    const weatherResult = await handleWeather({ text, homeLocation });
    results.push(formatSection("Weather", weatherResult?.text || "No weather response available."));
    data.weather = weatherResult || null;
  }

  if (parsed.capabilities.includes("search") && typeof searchWeb === "function") {
    const searchResult = await searchWeb(parsed.searchQuery);
    results.push(formatSection("Web Search", searchResult?.text || "No search response available."));
    data.search = searchResult || null;
  }

  const reply = results.filter(Boolean).join("\n\n").trim();
  if (!reply) return { handled: false };

  return {
    handled: true,
    reply,
    data,
    capabilities: parsed.capabilities
  };
}
