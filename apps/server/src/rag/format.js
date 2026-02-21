const DEFAULT_MAX_SOURCES = 4;
const DEFAULT_SNIPPET_CHARS = 220;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncate(value, maxChars) {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function looksLikeRawContext(text) {
  if (!text) return false;
  const raw = String(text);
  return /\[\d+\]\s+.+\|\s+\S+/.test(raw) || /\[S\d+\]\s+.+\|\s+summary:/.test(raw);
}

function resolveCitationTitle(cite = {}) {
  return (
    cite.meeting_title
    || cite.title
    || cite.source_title
    || cite.source_name
    || "Source"
  );
}

function resolveCitationDate(cite = {}) {
  return cite.occurred_at || cite.published_at || cite.date || "";
}

function resolveCitationSnippet(cite = {}) {
  return cite.snippet || cite.summary || cite.text || "";
}

export function formatRagAnswer({
  answer,
  citations = [],
  maxSources = DEFAULT_MAX_SOURCES,
  snippetChars = DEFAULT_SNIPPET_CHARS
} = {}) {
  const safeCitations = Array.isArray(citations) ? citations : [];
  const rawAnswer = String(answer || "").trim();
  const hasSources = safeCitations.length > 0;
  const lower = rawAnswer.toLowerCase();

  let effectiveAnswer = rawAnswer;
  if (!effectiveAnswer) {
    effectiveAnswer = hasSources
      ? "Here are the most relevant snippets from your knowledge base."
      : "No relevant knowledge was found.";
  }
  if (looksLikeRawContext(rawAnswer) || lower.startsWith("context retrieved")) {
    effectiveAnswer = hasSources
      ? "Here are the most relevant snippets from your knowledge base."
      : "No relevant knowledge was found.";
  }
  if (lower.startsWith("no trading knowledge available") || lower.startsWith("no knowledge available")) {
    effectiveAnswer = "No relevant knowledge was found.";
  }

  const lines = [];
  if (effectiveAnswer) {
    lines.push("Answer:");
    lines.push(effectiveAnswer);
  }

  if (hasSources) {
    lines.push("");
    const shown = Math.min(maxSources, safeCitations.length);
    lines.push(`Sources (${shown} of ${safeCitations.length}):`);
    safeCitations.slice(0, shown).forEach((cite, idx) => {
      const title = resolveCitationTitle(cite);
      const date = resolveCitationDate(cite);
      const header = `${idx + 1}) ${title}${date ? ` (${date})` : ""}`;
      lines.push(header);
      const snippet = truncate(resolveCitationSnippet(cite), snippetChars);
      if (snippet) lines.push(`  ${snippet}`);
    });
  }

  return lines.join("\n").trim();
}

