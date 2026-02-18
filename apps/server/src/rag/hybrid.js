const DEFAULT_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "how",
  "i", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "were",
  "what", "when", "where", "who", "why", "with", "you", "your", "me", "my", "we", "our"
]);

function normalizeToken(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .trim();
}

export function buildFtsQuery(text, { maxTerms = 8 } = {}) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  const tokens = raw
    .split(/\s+/)
    .map(normalizeToken)
    .filter(token => token.length > 2 && !DEFAULT_STOPWORDS.has(token));
  if (!tokens.length) return "";
  const deduped = Array.from(new Set(tokens)).slice(0, Math.max(1, maxTerms));
  return deduped.map(token => `"${token}"`).join(" OR ");
}

export function mergeHybridMatches({
  vectorMatches = [],
  lexicalMatches = [],
  alpha = 0.65,
  rrfK = 60
} = {}) {
  const weights = new Map();
  const vectorRanks = new Map();
  const lexicalRanks = new Map();

  vectorMatches.forEach((item, idx) => {
    if (!item?.chunk_id) return;
    const rank = idx + 1;
    vectorRanks.set(item.chunk_id, rank);
  });
  lexicalMatches.forEach((item, idx) => {
    if (!item?.chunk_id) return;
    const rank = idx + 1;
    lexicalRanks.set(item.chunk_id, rank);
  });

  const allIds = new Set([...vectorRanks.keys(), ...lexicalRanks.keys()]);
  for (const chunkId of allIds) {
    const vRank = vectorRanks.get(chunkId);
    const lRank = lexicalRanks.get(chunkId);
    const vScore = vRank ? (alpha / (rrfK + vRank)) : 0;
    const lScore = lRank ? ((1 - alpha) / (rrfK + lRank)) : 0;
    weights.set(chunkId, {
      chunk_id: chunkId,
      score: vScore + lScore,
      vectorRank: vRank || null,
      lexicalRank: lRank || null
    });
  }

  return Array.from(weights.values()).sort((a, b) => b.score - a.score);
}

