// Trading knowledge RAG smoke test
// Usage: node scripts/trading_knowledge_smoke.js
// Optional env:
//   TRADING_SMOKE_BASE_URL (default http://127.0.0.1:8790)
//   TRADING_SMOKE_TOP_K (default 6)
//   TRADING_SMOKE_SHOW_SNIPPETS=1
//   TRADING_SMOKE_SNIPPET_LIMIT=5
//   TRADING_SMOKE_MODE=both|strict|lenient (default both)
//   TRADING_SMOKE_MIN_RELEVANCE=0.08
//   TRADING_SMOKE_MIN_CITATIONS=2
//   TRADING_SMOKE_MIN_SNIPPET_CHARS=200
//   TRADING_SMOKE_QUESTION_FILE=path/to/questions.txt|json
//   TRADING_SMOKE_QUESTIONS="q1||q2||q3"

const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.TRADING_SMOKE_BASE_URL || "http://127.0.0.1:8790";
const TOP_K = Number(process.env.TRADING_SMOKE_TOP_K || 6);
const SHOW_SNIPPETS = String(process.env.TRADING_SMOKE_SHOW_SNIPPETS || "0") === "1";
const SNIPPET_LIMIT = Number(process.env.TRADING_SMOKE_SNIPPET_LIMIT || 5);
const MODE = String(process.env.TRADING_SMOKE_MODE || "both").toLowerCase();
const MIN_RELEVANCE = Number(process.env.TRADING_SMOKE_MIN_RELEVANCE || 0.08);
const MIN_CITATIONS = Number(process.env.TRADING_SMOKE_MIN_CITATIONS || 2);
const MIN_SNIPPET_CHARS = Number(process.env.TRADING_SMOKE_MIN_SNIPPET_CHARS || 200);

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "what", "when", "where", "which", "will", "would",
  "should", "could", "into", "about", "between", "after", "before", "over", "under", "within", "without",
  "your", "their", "they", "them", "you", "yours", "ours", "ourselves", "how", "why", "are", "is", "was",
  "were", "be", "been", "being", "to", "of", "in", "on", "as", "at", "by", "or", "an", "a"
]);

async function ensureFetch() {
  if (typeof fetch !== "undefined") return fetch;
  // Fallback for older Node runtimes
  const mod = await import("node-fetch");
  return mod.default;
}

function loadQuestionsFromEnv() {
  const raw = String(process.env.TRADING_SMOKE_QUESTIONS || "").trim();
  if (!raw) return [];
  return raw
    .split(/\|\||\n|;/)
    .map(q => q.trim())
    .filter(Boolean);
}

function loadQuestionsFromFile(filePath) {
  if (!filePath) return [];
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return [];
  const raw = fs.readFileSync(resolved, "utf-8");
  if (resolved.toLowerCase().endsWith(".json")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(q => String(q)).filter(Boolean);
      if (Array.isArray(parsed?.questions)) return parsed.questions.map(q => String(q)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return raw
    .split(/\r?\n/)
    .map(q => q.trim())
    .filter(Boolean);
}

function defaultQuestions() {
  return [
    "Explain how RSI should be interpreted and common pitfalls.",
    "What is the difference between market and limit orders and when to use each?",
    "Describe the role of VWAP and how traders use it intraday.",
    "What are the key risks in trading highly volatile crypto assets?",
    "Summarize best practices for backtesting to avoid overfitting.",
    "Explain risk management techniques for position sizing.",
    "What are the typical signals of trend reversal in candlestick analysis?",
    "How do macroeconomic announcements impact equity markets?"
  ];
}

function summarizeCitations(citations = []) {
  const snippets = citations.map(c => String(c.snippet || ""));
  const totalChars = snippets.reduce((acc, s) => acc + s.length, 0);
  const avgChars = snippets.length ? Math.round(totalChars / snippets.length) : 0;
  const uniqueSources = new Set(citations.map(c => c.meeting_title || c.chunk_id || "")).size;
  return { totalChars, avgChars, uniqueSources };
}

function previewSnippet(snippet, limit = 160) {
  const text = String(snippet || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function computeRelevance(question, citations = []) {
  const keywords = tokenize(question);
  if (!keywords.length || !citations.length) {
    return { score: 0, keywordCount: keywords.length, perCitation: [] };
  }
  const keywordSet = new Set(keywords);
  const perCitation = citations.map(cite => {
    const snippetTokens = new Set(tokenize(cite.snippet));
    let overlap = 0;
    keywordSet.forEach(token => {
      if (snippetTokens.has(token)) overlap += 1;
    });
    const ratio = overlap / keywordSet.size;
    return { ratio, overlap, total: keywordSet.size };
  });
  const top = perCitation
    .map(p => p.ratio)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const score = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
  return { score, keywordCount: keywordSet.size, perCitation };
}

function formatScore(score) {
  return `${(score * 100).toFixed(1)}%`;
}

function warnIfWeak({ citations, depth, relevance }) {
  const warnings = [];
  if ((citations || []).length < MIN_CITATIONS) warnings.push("low_citations");
  if ((depth?.avgChars || 0) < MIN_SNIPPET_CHARS) warnings.push("short_snippets");
  if ((relevance?.score || 0) < MIN_RELEVANCE) warnings.push("low_relevance");
  return warnings;
}

async function getJson(fetchFn, url, options = {}) {
  const res = await fetchFn(url, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function run() {
  const fetchFn = await ensureFetch();
  const questionFile = process.env.TRADING_SMOKE_QUESTION_FILE || "";
  const fileQuestions = loadQuestionsFromFile(questionFile);
  const envQuestions = loadQuestionsFromEnv();
  const questions = fileQuestions.length
    ? fileQuestions
    : envQuestions.length
      ? envQuestions
      : defaultQuestions();

  console.log(`Trading knowledge smoke test (${BASE})`);
  console.log(`Mode: ${MODE} | topK=${TOP_K}`);

  const status = await getJson(fetchFn, `${BASE}/api/rag/status`);
  if (status.ok) {
    const counts = status.data || {};
    console.log(`RAG totals: meetings=${counts.totalMeetings || 0}, chunks=${counts.totalChunks || 0}, tradingMeetings=${counts.tradingMeetings || 0}`);
    if (counts.vectorStore) {
      console.log(`Vector store: vecEnabled=${counts.vectorStore.vecEnabled}, path=${counts.vectorStore.dbPath || ""}`);
    }
  } else {
    console.log(`RAG status failed (${status.status}).`);
  }

  const sources = await getJson(fetchFn, `${BASE}/api/trading/knowledge/sources?includeDisabled=1`);
  if (sources.ok) {
    const items = sources.data?.items || [];
    const enabled = items.filter(s => s.enabled).length;
    console.log(`Sources: total=${items.length}, enabled=${enabled}`);
  }

  for (const question of questions) {
    console.log("\n---");
    console.log(`Q: ${question}`);
    const runStrict = MODE === "both" || MODE === "strict";
    const runLenient = MODE === "both" || MODE === "lenient";
    let strictAnswer = "";
    let strictCitations = [];

    if (runStrict) {
      const res = await getJson(fetchFn, `${BASE}/api/trading/knowledge/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, topK: TOP_K })
      });
      if (!res.ok) {
        console.log(`Strict Error (${res.status}): ${res.data?.error || "request_failed"}`);
      } else {
        strictAnswer = String(res.data?.answer || "");
        strictCitations = Array.isArray(res.data?.citations) ? res.data.citations : [];
        const depth = summarizeCitations(strictCitations);
        const relevance = computeRelevance(question, strictCitations);
        const warnings = warnIfWeak({ citations: strictCitations, depth, relevance });
        console.log(`Strict A: ${strictAnswer.slice(0, 600)}${strictAnswer.length > 600 ? "..." : ""}`);
        console.log(`Strict Citations: ${strictCitations.length} | uniqueSources=${depth.uniqueSources} | avgSnippetChars=${depth.avgChars} | relevance=${formatScore(relevance.score)}${warnings.length ? ` | WARN ${warnings.join(",")}` : ""}`);
        const toShow = strictCitations.slice(0, SNIPPET_LIMIT);
        toShow.forEach((cite, idx) => {
          const label = `${idx + 1}. ${cite.meeting_title || "Unknown"} | ${cite.chunk_id || ""}`;
          if (SHOW_SNIPPETS) {
            console.log(label);
            console.log(previewSnippet(cite.snippet, 240));
          } else {
            console.log(`${label} (${(cite.snippet || "").length} chars)`);
          }
        });
      }
    }

    if (runLenient) {
      const res = await getJson(fetchFn, `${BASE}/api/trading/knowledge/ask-deep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, topK: TOP_K, allowFallback: true })
      });
      if (!res.ok) {
        console.log(`Lenient Error (${res.status}): ${res.data?.error || "request_failed"}`);
      } else {
        const answer = String(res.data?.answer || "");
        const citations = Array.isArray(res.data?.citations) ? res.data.citations : [];
        const depth = summarizeCitations(citations);
        const relevance = computeRelevance(question, citations);
        const warnings = warnIfWeak({ citations, depth, relevance });
        const source = res.data?.source || "lenient";
        console.log(`Lenient A (${source}): ${answer.slice(0, 600)}${answer.length > 600 ? "..." : ""}`);
        console.log(`Lenient Citations: ${citations.length} | uniqueSources=${depth.uniqueSources} | avgSnippetChars=${depth.avgChars} | relevance=${formatScore(relevance.score)}${warnings.length ? ` | WARN ${warnings.join(",")}` : ""}`);
        if (runStrict && strictAnswer) {
          const improved = /don't know|do not know|unknown/i.test(strictAnswer) && answer && !/don't know|do not know|unknown/i.test(answer);
          if (improved) {
            console.log("Lenient improved: strict was unsure, lenient provided detail.");
          }
        }
      }
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
