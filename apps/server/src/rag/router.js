import { responsesCreate } from "../llm/openaiClient.js";
import { getEmbedding } from "./embeddings.js";
import { searchChunkIds, searchChunkIdsLexical, getChunksByIds, listMeetingSummaries, getRagCollection } from "./vectorStore.js";
import { buildFtsQuery, mergeHybridMatches } from "./hybrid.js";
import { selectMetaRoutes } from "./metaRag.js";

// OpenAI client handled by shared wrapper.

const ROUTE_DEFINITIONS = new Map([
  ["fireflies", { id: "fireflies", filters: { meetingType: "fireflies" } }],
  ["recordings", { id: "recordings", filters: { meetingIdPrefix: "recording:" } }],
  ["trading", { id: "trading", filters: { meetingIdPrefix: "trading:" } }],
  ["signals", { id: "signals", filters: { meetingIdPrefix: "signals:" } }],
  ["memory", { id: "memory", filters: { meetingIdPrefix: "memory:" } }],
  ["feedback", { id: "feedback", filters: { meetingIdPrefix: "feedback:" } }],
  ["notes", { id: "notes", filters: { meetingIdPrefix: "rag:notes:" } }],
  ["todos", { id: "todos", filters: { meetingIdPrefix: "rag:todos:" } }],
  ["gmail", { id: "gmail", filters: { meetingIdPrefix: "rag:gmail:" } }],
  ["outlook", { id: "outlook", filters: { meetingIdPrefix: "rag:outlook:" } }],
  ["slack", { id: "slack", filters: { meetingIdPrefix: "rag:slack:" } }],
  ["confluence", { id: "confluence", filters: { meetingIdPrefix: "rag:confluence:" } }],
  ["notion", { id: "notion", filters: { meetingIdPrefix: "rag:notion:" } }],
  ["jira", { id: "jira", filters: { meetingIdPrefix: "rag:jira:" } }]
]);

const MAX_AUTO_ROUTES = Math.max(2, Number(process.env.RAG_MAX_ROUTES || 4));

function buildRoute(id, filtersOverride = null) {
  if (!id) return { id: "all", filters: { ...(filtersOverride || {}) } };
  if (id === "all") return { id: "all", filters: { ...(filtersOverride || {}) } };
  const base = ROUTE_DEFINITIONS.get(id);
  if (base) {
    return { id: base.id, filters: { ...(base.filters || {}), ...(filtersOverride || {}) } };
  }
  return { id, filters: { meetingIdPrefix: `rag:${id}:`, ...(filtersOverride || {}) } };
}

function normalizeRagModel(model) {
  const cleaned = String(model || "").trim().toLowerCase();
  if (!cleaned) return "";
  if (cleaned === "recording") return "recordings";
  if (cleaned === "meeting") return "meetings";
  if (cleaned === "emails") return "email";
  if (cleaned === "event") return "events";
  if (cleaned === "docs") return "documentation";
  return cleaned;
}

function resolveScrapeRouteId() {
  const env = String(process.env.SCRAPE_RAG_COLLECTION_ID || process.env.ACTION_SCRAPE_RAG_COLLECTION || "").trim();
  if (env) return env;
  if (getRagCollection("screenscreen-scrape-website-just-show-th")) return "screenscreen-scrape-website-just-show-th";
  return "screenscrape";
}

function resolveExplicitRoutes(model) {
  const normalized = normalizeRagModel(model);
  if (!normalized || normalized === "auto") return [];
  if (normalized === "meetings") {
    return [buildRoute("fireflies"), buildRoute("recordings")];
  }
  if (normalized === "email" || normalized === "mail") {
    return [buildRoute("gmail"), buildRoute("outlook")];
  }
  if (normalized === "calendar" || normalized === "events") {
    return [buildRoute("outlook")];
  }
  if (normalized === "documentation" || normalized === "wiki") {
    return [buildRoute("confluence"), buildRoute("notion"), buildRoute("notes")];
  }
  if (normalized === "recordings") return [buildRoute("recordings")];
  if (normalized === "fireflies") return [buildRoute("fireflies")];
  if (normalized === "trading") return [buildRoute("trading")];
  if (normalized === "signals") return [buildRoute("signals")];
  if (normalized === "memory") return [buildRoute("memory")];
  if (normalized === "feedback") return [buildRoute("feedback")];
  if (normalized === "notes") return [buildRoute("notes")];
  if (normalized === "todos") return [buildRoute("todos")];
  if (normalized === "gmail") return [buildRoute("gmail")];
  if (normalized === "outlook") return [buildRoute("outlook")];
  if (normalized === "slack") return [buildRoute("slack")];
  if (normalized === "confluence") return [buildRoute("confluence")];
  if (normalized === "notion") return [buildRoute("notion")];
  if (normalized === "jira") return [buildRoute("jira")];
  if (normalized === "all") return [buildRoute("all")];
  return [buildRoute(normalized)];
}

function matchAny(text, patterns = []) {
  return patterns.some(pattern => pattern.test(text));
}

export function detectRagSignals(question = "") {
  const text = String(question || "").toLowerCase();
  const meetingTerms = [
    /\bmeeting(s)?\b/,
    /\btranscript(s)?\b/,
    /\bminutes?\b/,
    /\baction items?\b/,
    /\bdecisions?\b/,
    /\brecap\b/
  ];
  const recordingTerms = [
    /\brecording(s)?\b/,
    /\brecorded\b/,
    /\baudio\b/,
    /\bmic\b/,
    /\bcall recording\b/
  ];
  const notesTerms = [
    /\bnotes?\b/,
    /\brunbook\b/,
    /\bplaybook\b/
  ];
  const docsTerms = [
    /\bdocs?\b/,
    /\bdocumentation\b/,
    /\bwiki\b/,
    /\bknowledge base\b/,
    /\bkb\b/
  ];
  const emailTerms = [
    /\bemail(s)?\b/,
    /\binbox\b/,
    /\bsubject\b/,
    /\bsender\b/
  ];
  const calendarTerms = [
    /\bcalendar\b/,
    /\bevent(s)?\b/,
    /\bmeeting invite\b/
  ];
  const slackTerms = [
    /\bslack\b/,
    /\bchannel\b/,
    /\bthread\b/,
    /\bdm\b/,
    /\bdirect message\b/
  ];
  const jiraTerms = [
    /\bjira\b/,
    /\bticket\b/,
    /\bissue\b/,
    /\bbug\b/,
    /\bepic\b/,
    /\bstory\b/,
    /\bincident\b/
  ];
  const todoTerms = [
    /\bto-?do(s)?\b/,
    /\breminder(s)?\b/,
    /\bchecklist\b/,
    /\btask list\b/
  ];
  const memoryTerms = [
    /\bremember\b/,
    /\bmemory\b/,
    /\bpreference(s)?\b/,
    /\bmy (favorite|preferred|home|location|timezone)\b/
  ];
  const feedbackTerms = [
    /\bfeedback\b/,
    /\bthumbs? up\b/,
    /\bthumbs? down\b/,
    /\brating\b/
  ];
  const tradingTerms = [
    /\b(stock|stocks|crypto|trading|options|portfolio|ticker|market)\b/
  ];
  const signalsTerms = [
    /\b(signals?|macro|alerts?)\b/
  ];

  const signals = {
    fireflies: /\bfireflies\b/.test(text),
    recording: matchAny(text, recordingTerms),
    meeting: matchAny(text, meetingTerms),
    notes: matchAny(text, notesTerms),
    docs: matchAny(text, docsTerms),
    confluence: /\bconfluence\b/.test(text),
    notion: /\bnotion\b/.test(text),
    gmail: /\bgmail\b/.test(text),
    outlook: /\boutlook\b/.test(text),
    email: matchAny(text, emailTerms),
    calendar: matchAny(text, calendarTerms),
    slack: matchAny(text, slackTerms),
    jira: matchAny(text, jiraTerms),
    todo: matchAny(text, todoTerms),
    memory: matchAny(text, memoryTerms),
    feedback: matchAny(text, feedbackTerms),
    trading: matchAny(text, tradingTerms),
    signals: matchAny(text, signalsTerms),
    scrape: matchAny(text, [
      /\bscrape\b/,
      /\bscreen\s*scrape\b/,
      /\bweb scraping\b/,
      /\bextract(ed|ion)?\b/,
      /\bselector\b/,
      /\bmacro\b/,
      /\bscreenscreen\b/
    ])
  };
  signals.any = Object.entries(signals).some(([key, value]) => key !== "any" && Boolean(value));
  return signals;
}

function buildContext(chunks) {
  return chunks.map((chunk, idx) => {
    const header = `[${idx + 1}] ${chunk.meeting_title || "Meeting"} (${chunk.occurred_at || ""}) | ${chunk.chunk_id}`;
    return `${header}\n${chunk.text}`.trim();
  }).join("\n\n");
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function getWeekStart(date) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  return startOfDay(start);
}

function parseRelativeDateRange(question) {
  const text = String(question || "").toLowerCase();
  const now = new Date();
  if (!text) return null;

  const lastDaysMatch = text.match(/\b(last|past)\s+(\d+)\s+days?\b/);
  if (lastDaysMatch) {
    const days = Number(lastDaysMatch[2]);
    if (Number.isFinite(days) && days > 0) {
      const end = endOfDay(now);
      const start = startOfDay(new Date(now.getTime() - days * 86400000));
      return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: `past_${days}_days` };
    }
  }

  const lastWeeksMatch = text.match(/\b(last|past)\s+(\d+)\s+weeks?\b/);
  if (lastWeeksMatch) {
    const weeks = Number(lastWeeksMatch[2]);
    if (Number.isFinite(weeks) && weeks > 0) {
      const days = weeks * 7;
      const end = endOfDay(now);
      const start = startOfDay(new Date(now.getTime() - days * 86400000));
      return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: `past_${days}_days` };
    }
  }

  const lastMonthsMatch = text.match(/\b(last|past)\s+(\d+)\s+months?\b/);
  if (lastMonthsMatch) {
    const months = Number(lastMonthsMatch[2]);
    if (Number.isFinite(months) && months > 0) {
      const end = endOfDay(now);
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - months, now.getDate()));
      return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: `past_${months}_months` };
    }
  }

  if (text.includes("last week") || text.includes("past week")) {
    const end = endOfDay(now);
    const start = startOfDay(new Date(now.getTime() - 7 * 86400000));
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "last_week" };
  }

  if (text.includes("this week")) {
    const start = getWeekStart(now);
    const end = endOfDay(now);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "this_week" };
  }

  if (text.includes("yesterday")) {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const start = startOfDay(y);
    const end = endOfDay(y);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "yesterday" };
  }

  if (text.includes("today")) {
    const start = startOfDay(now);
    const end = endOfDay(now);
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "today" };
  }

  if (text.includes("last month") || text.includes("past month")) {
    const end = endOfDay(now);
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()));
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: "last_month" };
  }

  if (/\b(recent|latest|newest)\b/.test(text)) {
    const days = Math.max(1, Number(process.env.RAG_RECENT_DAYS || 30));
    const end = endOfDay(now);
    const start = startOfDay(new Date(now.getTime() - days * 86400000));
    return { dateFrom: start.toISOString(), dateTo: end.toISOString(), label: `recent_${days}_days` };
  }

  return null;
}

function wantsSummary(question) {
  const text = String(question || "").toLowerCase();
  return /\b(summary|summarize|recap|overview)\b/.test(text);
}

function getHybridSettings() {
  return {
    enabled: String(process.env.RAG_HYBRID_ENABLED || "1") === "1",
    alpha: Number(process.env.RAG_HYBRID_ALPHA || 0.65),
    lexicalTopK: Number(process.env.RAG_LEXICAL_TOP_K || 24),
    rrfK: Number(process.env.RAG_HYBRID_RRF_K || 60)
  };
}

function buildSummaryContext(summaries = []) {
  return summaries
    .map((row, idx) => {
      const summary = row.summary_json ? JSON.parse(row.summary_json) : null;
      const decisions = row.decisions_json ? JSON.parse(row.decisions_json) : [];
      const tasks = row.tasks_json ? JSON.parse(row.tasks_json) : [];
      const nextSteps = row.next_steps_json ? JSON.parse(row.next_steps_json) : [];
      const overview = Array.isArray(summary?.overview) ? summary.overview.join(" ") : "";
      const tldr = summary?.tldr || overview || summary?.summary || "";
      const taskText = tasks.length
        ? tasks.map(task => task.task || task.title || task.text || "").filter(Boolean).join("; ")
        : "";
      const decisionText = decisions.length ? decisions.join("; ") : "";
      const nextText = nextSteps.length ? nextSteps.join("; ") : "";
      const header = `[S${idx + 1}] ${row.title || "Meeting"} (${row.occurred_at || ""}) | summary:${row.id}`;
      const body = [
        tldr ? `Summary: ${tldr}` : "",
        decisionText ? `Decisions: ${decisionText}` : "",
        taskText ? `Action Items: ${taskText}` : "",
        nextText ? `Next Steps: ${nextText}` : ""
      ].filter(Boolean).join("\n");
      return `${header}\n${body}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function limitRoutes(routes = []) {
  if (!Array.isArray(routes)) return [];
  const seen = new Set();
  const ordered = [];
  for (const route of routes) {
    if (!route?.id) continue;
    if (seen.has(route.id)) continue;
    seen.add(route.id);
    ordered.push(route);
  }
  if (ordered.length <= MAX_AUTO_ROUTES) return ordered;
  return ordered.slice(0, MAX_AUTO_ROUTES);
}

function mergeRouteSets(primary = [], secondary = []) {
  const combined = [];
  const seen = new Set();
  const add = (route) => {
    if (!route?.id) return;
    if (seen.has(route.id)) return;
    seen.add(route.id);
    combined.push(route);
  };
  primary.forEach(add);
  secondary.forEach(add);
  return combined;
}

function resolveRoutesFromSignals(question, signalsOverride) {
  const signals = signalsOverride || detectRagSignals(question);
  const routeScores = new Map();
  let order = 0;
  const addRoute = (id, score, reason) => {
    if (!id) return;
    let entry = routeScores.get(id);
    if (!entry) {
      const route = buildRoute(id);
      entry = {
        ...route,
        score: 0,
        order: order++,
        reasons: new Set()
      };
      routeScores.set(id, entry);
    }
    entry.score += score;
    if (reason) entry.reasons.add(reason);
  };

  const meetingExplicit = signals.fireflies || signals.recording;
  if (signals.fireflies) addRoute("fireflies", 5, "fireflies");
  if (signals.recording) addRoute("recordings", 5, "recording");
  if (signals.meeting && !meetingExplicit) {
    addRoute("fireflies", 3, "meeting");
    addRoute("recordings", 3, "meeting");
  }

  if (signals.notes) addRoute("notes", 4, "notes");
  const docsExplicit = signals.confluence || signals.notion;
  if (signals.docs && !docsExplicit) {
    addRoute("confluence", 2, "docs");
    addRoute("notion", 2, "docs");
    addRoute("notes", 1, "docs");
  }
  if (signals.confluence) addRoute("confluence", 4, "confluence");
  if (signals.notion) addRoute("notion", 4, "notion");
  if (signals.docs && docsExplicit && !signals.notes) {
    addRoute("notes", 1, "docs");
  }

  const emailExplicit = signals.gmail || signals.outlook;
  if (signals.gmail) addRoute("gmail", 4, "gmail");
  if (signals.outlook) addRoute("outlook", 4, "outlook");
  if (signals.email && !emailExplicit) {
    addRoute("gmail", 2, "email");
    addRoute("outlook", 2, "email");
  }
  if (signals.calendar && !emailExplicit && !signals.email) {
    addRoute("outlook", 2, "calendar");
  }

  if (signals.slack) addRoute("slack", 3, "slack");
  if (signals.jira) addRoute("jira", 3, "jira");
  if (signals.todo) addRoute("todos", 3, "todos");
  if (signals.memory) addRoute("memory", 3, "memory");
  if (signals.feedback) addRoute("feedback", 3, "feedback");
  if (signals.trading) addRoute("trading", 3, "trading");
  if (signals.signals) addRoute("signals", 3, "signals");
  if (signals.scrape) addRoute(resolveScrapeRouteId(), 3, "scrape");

  const ranked = Array.from(routeScores.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    })
    .map(entry => ({
      id: entry.id,
      filters: entry.filters,
      reason: Array.from(entry.reasons).join("|"),
      score: entry.score
    }));

  return ranked;
}

async function resolveRoutesAsync(question, ragModel = "auto") {
  const normalized = normalizeRagModel(ragModel);
  const signals = detectRagSignals(question);
  if (normalized && normalized !== "auto") {
    return { routes: resolveExplicitRoutes(normalized), signals, source: "explicit" };
  }

  const heuristicRoutes = resolveRoutesFromSignals(question, signals);
  if (normalized === "auto") {
    try {
      const metaRoutes = await selectMetaRoutes(question);
      if (metaRoutes.length) {
        const merged = mergeRouteSets(metaRoutes, heuristicRoutes);
        const limited = limitRoutes(merged);
        return { routes: limited, signals, source: "meta" };
      }
    } catch {
      // fall back to heuristics
    }
  }

  const resolved = heuristicRoutes.length ? heuristicRoutes : [buildRoute("all")];
  return { routes: limitRoutes(resolved), signals, source: "heuristic" };
}

function deriveCollectionInfo(meetingId = "", chunkId = "") {
  const raw = String(meetingId || chunkId || "");
  if (!raw) return { sourceType: "unknown", collectionId: "" };
  if (raw.startsWith("summary:")) return { sourceType: "summary", collectionId: "fireflies" };
  if (raw.startsWith("memory:")) return { sourceType: "memory", collectionId: "memory" };
  if (raw.startsWith("feedback:")) return { sourceType: "feedback", collectionId: "feedback" };
  if (raw.startsWith("recording:")) return { sourceType: "recording", collectionId: "recordings" };
  if (raw.startsWith("trading:")) return { sourceType: "trading", collectionId: "trading" };
  if (raw.startsWith("signals:")) return { sourceType: "signals", collectionId: "signals" };
  if (raw.startsWith("rag:")) {
    const parts = raw.split(":");
    const collectionId = parts[1] || "custom";
    const known = new Set(["notes", "todos", "gmail", "outlook", "slack", "confluence", "notion", "jira"]);
    return { sourceType: known.has(collectionId) ? collectionId : "custom", collectionId };
  }
  return { sourceType: "fireflies", collectionId: "fireflies" };
}

function mergeRouteResults(routeResults, totalTopK, minPerRoute) {
  const combined = [];
  const used = new Set();
  for (const route of routeResults) {
    const items = route.items || [];
    let count = 0;
    for (const item of items) {
      if (used.has(item.chunk_id)) continue;
      combined.push(item);
      used.add(item.chunk_id);
      count += 1;
      if (count >= minPerRoute) break;
    }
  }

  const remaining = [];
  for (const route of routeResults) {
    const items = route.items || [];
    for (const item of items) {
      if (used.has(item.chunk_id)) continue;
      remaining.push(item);
    }
  }
  remaining.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  for (const item of remaining) {
    if (combined.length >= totalTopK) break;
    if (used.has(item.chunk_id)) continue;
    combined.push(item);
    used.add(item.chunk_id);
  }

  return combined.slice(0, totalTopK);
}

function buildRouteResults({ routes = [], orderedIds = [], merged = [], vectorById, baseFilters = {} } = {}) {
  const results = [];
  for (const route of routes) {
    const routeFilters = { ...(route.filters || {}), ...(baseFilters || {}) };
    const rows = getChunksByIds(orderedIds, routeFilters).filter(row => {
      if (!row?.meeting_id) return false;
      if (route.id === "meta") return true;
      return !String(row.meeting_id).startsWith("rag:meta:");
    });
    const byId = new Map(rows.map(row => [row.chunk_id, row]));
    const ordered = merged
      .map(match => {
        const row = byId.get(match.chunk_id);
        if (!row || !row.text) return null;
        const vector = vectorById?.get(match.chunk_id);
        return {
          ...row,
          distance: vector?.distance ?? (1 - match.score),
          hybrid_score: match.score,
          vector_rank: match.vectorRank,
          lexical_rank: match.lexicalRank,
          routeId: route.id
        };
      })
      .filter(Boolean);
    results.push({ id: route.id, filters: routeFilters, items: ordered });
  }
  return results;
}

const NON_FALLBACK_ROUTES = new Set(["memory", "feedback", "trading", "signals"]);

function buildFallbackRoutes(routes = [], signals = {}) {
  const ids = new Set(routes.map(route => route.id));
  const fallback = [];
  const add = (id) => {
    if (!id || ids.has(id)) return;
    if (fallback.find(route => route.id === id)) return;
    fallback.push(buildRoute(id));
  };

  if (ids.has("fireflies") && !ids.has("recordings")) add("recordings");
  if (ids.has("recordings") && !ids.has("fireflies")) add("fireflies");

  const wantsEmail = signals.email || signals.gmail || signals.outlook;
  if (wantsEmail) {
    if (!ids.has("gmail")) add("gmail");
    if (!ids.has("outlook")) add("outlook");
  }

  const wantsDocs = signals.docs || signals.notes || signals.confluence || signals.notion;
  if (wantsDocs) {
    if (!ids.has("confluence")) add("confluence");
    if (!ids.has("notion")) add("notion");
    if (!ids.has("notes")) add("notes");
  }

  if (!fallback.length) {
    const shouldFallbackAll = routes.some(route => !NON_FALLBACK_ROUTES.has(route.id));
    if (shouldFallbackAll) fallback.push(buildRoute("all"));
  }

  return limitRoutes(fallback);
}

const GAP_STOPWORDS = new Set([
  "the", "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "how",
  "i", "in", "is", "it", "of", "on", "or", "that", "this", "to", "was", "were", "what", "when",
  "where", "who", "why", "with", "you", "your", "me", "my", "we", "our", "about", "tell", "explain",
  "summarize", "summary", "recap", "meeting", "meetings", "notes", "note", "rag", "model", "collection",
  "recording", "recordings", "transcript", "email", "emails", "gmail", "outlook", "slack", "jira",
  "confluence", "notion", "doc", "docs", "documentation", "wiki", "todo", "todos", "task", "tasks",
  "reminder", "memory", "feedback", "signals", "trading", "message", "messages", "calendar", "event", "events"
]);

function extractTopic(question) {
  let text = String(question || "").trim();
  if (!text) return "";
  text = text.replace(/^rag:\s*[a-z0-9_-]+/i, "");
  text = text.replace(/^meeting:\s*/i, "");
  text = text.replace(/^(what is|who is|tell me about|explain|summarize|summary of|recap of)\s+/i, "");
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !GAP_STOPWORDS.has(token));
  if (!tokens.length) return "";
  return tokens.slice(0, 6).join(" ").trim();
}

export async function buildRagRoutePlan(question, { topK = 8, filters = {}, ragModel = "auto", channel = "" } = {}) {
  const query = String(question || "").trim();
  const autoRange = parseRelativeDateRange(query);
  const baseFilters = { ...(filters || {}) };
  if (!baseFilters.dateFrom && autoRange?.dateFrom) baseFilters.dateFrom = autoRange.dateFrom;
  if (!baseFilters.dateTo && autoRange?.dateTo) baseFilters.dateTo = autoRange.dateTo;

  const routeDecision = await resolveRoutesAsync(query, ragModel);
  const routes = Array.isArray(routeDecision.routes) ? routeDecision.routes : [];
  const effectiveTopK = Number(topK || process.env.RAG_TOP_K || 8);
  const minPerRoute = Math.min(3, Math.max(1, Math.floor(effectiveTopK / Math.max(1, routes.length))));
  const useSummaryMode = wantsSummary(query) && (baseFilters.dateFrom || baseFilters.dateTo);

  return {
    query,
    channel,
    routes,
    filters: baseFilters,
    autoDateRange: autoRange?.label || null,
    effectiveTopK,
    minPerRoute,
    useSummaryMode,
    routeSource: routeDecision.source || "heuristic",
    signals: routeDecision.signals || detectRagSignals(query)
  };
}

export async function answerRagQuestionRouted(question, { topK = 8, filters = {}, ragModel = "auto", conversationContext = "", skipAnswer = false } = {}) {
  const query = String(question || "").trim();
  const convoPrefix = conversationContext ? `Conversation context:\n${conversationContext}\n\n` : "";
  if (!query) {
    return { answer: "Question required.", citations: [], debug: { retrievedCount: 0, filters } };
  }

  const plan = await buildRagRoutePlan(query, { topK, filters, ragModel });
  const baseFilters = plan.filters || {};
  const routes = plan.routes || [];
  const effectiveTopK = plan.effectiveTopK;
  const minPerRoute = plan.minPerRoute;
  const useSummaryMode = plan.useSummaryMode;

  let summaryContext = "";
  const summaryCitations = [];
  if (useSummaryMode) {
    for (const route of routes) {
      const routeFilters = { ...(route.filters || {}), ...baseFilters };
      const summaryRows = listMeetingSummaries({
        dateFrom: routeFilters.dateFrom,
        dateTo: routeFilters.dateTo,
        meetingType: routeFilters.meetingType,
        meetingIdPrefix: routeFilters.meetingIdPrefix,
        limit: Math.max(6, effectiveTopK)
      });
      if (!summaryRows.length) continue;
      summaryContext = buildSummaryContext(summaryRows);
      summaryRows.forEach(row => {
        const summary = row.summary_json ? JSON.parse(row.summary_json) : null;
        const overview = Array.isArray(summary?.overview) ? summary.overview.join(" ") : "";
        const tldr = summary?.tldr || overview || "";
        const meta = deriveCollectionInfo(row.id, `summary:${row.id}`);
        summaryCitations.push({
          meeting_title: row.title || "Meeting",
          occurred_at: row.occurred_at || "",
          chunk_id: `summary:${row.id}`,
          snippet: tldr || "Summary not available.",
          source_type: meta.sourceType,
          collection_id: meta.collectionId,
          route_id: route.id || ""
        });
      });
      if (summaryContext) break;
    }
  }

  const embedding = await getEmbedding(query);
  const searchLimit = Math.max(effectiveTopK * 4, effectiveTopK, 24);
  const vectorMatches = await searchChunkIds(embedding, searchLimit);
  const hybrid = getHybridSettings();
  const lexicalQuery = hybrid.enabled ? buildFtsQuery(query) : "";
  const lexicalMatches = hybrid.enabled && lexicalQuery
    ? searchChunkIdsLexical(lexicalQuery, Math.max(hybrid.lexicalTopK, searchLimit))
    : [];
  const merged = (hybrid.enabled && lexicalMatches.length)
    ? mergeHybridMatches({ vectorMatches, lexicalMatches, alpha: hybrid.alpha, rrfK: hybrid.rrfK })
    : vectorMatches.map((item, idx) => ({
        chunk_id: item.chunk_id,
        score: 1 / (1 + idx),
        vectorRank: idx + 1,
        lexicalRank: null
      }));
  const orderedIds = merged.map(m => m.chunk_id).filter(Boolean);

  const vectorById = new Map(vectorMatches.map(match => [match.chunk_id, match]));
  const routeResults = buildRouteResults({
    routes,
    orderedIds,
    merged,
    vectorById,
    baseFilters
  });

  let mergedChunks = mergeRouteResults(routeResults, effectiveTopK, minPerRoute);
  let fallbackUsed = false;
  let fallbackRoutes = [];
  if (!mergedChunks.length) {
    fallbackRoutes = buildFallbackRoutes(routes, plan.signals || {});
    if (fallbackRoutes.length) {
      const fallbackResults = buildRouteResults({
        routes: fallbackRoutes,
        orderedIds,
        merged,
        vectorById,
        baseFilters
      });
      const fallbackChunks = mergeRouteResults(fallbackResults, effectiveTopK, minPerRoute);
      if (fallbackChunks.length) {
        mergedChunks = fallbackChunks;
        fallbackUsed = true;
      }
    }
  }
  const context = buildContext(mergedChunks);

  let answer = "I don't know based on the provided context.";
  const combinedContext = [summaryContext, context].filter(Boolean).join("\n\n");
  if (!skipAnswer && process.env.OPENAI_API_KEY && combinedContext) {
    const system = "Answer using ONLY the provided context. If the answer is not in the context, say you don't know.";
    const user = `${convoPrefix}Question: ${query}\n\nContext:\n${combinedContext}`;
    const model = process.env.OPENAI_PRIMARY_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const response = await responsesCreate({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] }
      ],
      max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 300)
    });
    answer = response?.output_text || answer;
  } else if (combinedContext) {
    const totalCitations = mergedChunks.length + summaryCitations.length;
    answer = skipAnswer
      ? `Context retrieved (${totalCitations} citations).`
      : `Context retrieved (${totalCitations} citations). Configure OPENAI_API_KEY for natural-language answers.`;
  }

  const citations = [
    ...summaryCitations,
    ...mergedChunks.map(chunk => {
      const meta = deriveCollectionInfo(chunk.meeting_id, chunk.chunk_id);
      return {
        meeting_title: chunk.meeting_title || "Meeting",
        occurred_at: chunk.occurred_at || "",
        chunk_id: chunk.chunk_id,
        snippet: chunk.text,
        source_type: meta.sourceType,
        collection_id: meta.collectionId,
        route_id: chunk.routeId || ""
      };
    })
  ];

  const ragUnknown = /i don't know based on the provided context/i.test(String(answer || ""));
  let gap = null;
  if (!citations.length || ragUnknown) {
    const topic = extractTopic(query);
    if (topic) {
      gap = {
        action: "propose_rag_model",
        topic,
        reason: citations.length ? "answer_unknown" : "no_citations"
      };
    }
  }

  return {
    answer,
    citations,
    gap,
    debug: {
      retrievedCount: mergedChunks.length,
      summaryCount: summaryCitations.length,
      filters: baseFilters,
      routes: routes.map(route => route.id),
      routeSource: plan.routeSource || "heuristic",
      routeSignals: plan.signals || {},
      fallbackUsed,
      fallbackRoutes: fallbackRoutes.map(route => route.id),
      autoDateRange: plan.autoDateRange || null,
      hybrid: {
        enabled: hybrid.enabled,
        alpha: hybrid.alpha,
        rrfK: hybrid.rrfK,
        lexicalQuery,
        lexicalCount: lexicalMatches.length,
        vectorCount: vectorMatches.length
      },
      skipAnswer
    }
  };
}


