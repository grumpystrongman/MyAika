const STORAGE_KEY = "aika_wizard_chess_memory_v1";

export function createDefaultWizardMemory() {
  return {
    gamesPlayed: 0,
    openings: {},
    pieceMoves: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    capturesPlayed: 0,
    quietMovesPlayed: 0,
    sacrifices: 0,
    blunders: 0,
    brilliantMoves: 0,
    lastResults: []
  };
}

export function loadWizardMemory() {
  if (typeof window === "undefined") return createDefaultWizardMemory();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultWizardMemory();
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultWizardMemory(),
      ...parsed,
      openings: { ...createDefaultWizardMemory().openings, ...(parsed?.openings || {}) },
      pieceMoves: { ...createDefaultWizardMemory().pieceMoves, ...(parsed?.pieceMoves || {}) },
      lastResults: Array.isArray(parsed?.lastResults) ? parsed.lastResults.slice(0, 12) : []
    };
  } catch {
    return createDefaultWizardMemory();
  }
}

export function saveWizardMemory(memory) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore storage failures
  }
}

export function recordWizardMoveMemory(memory, move = {}, actor = "player") {
  if (actor !== "player") return memory;
  const next = { ...memory, pieceMoves: { ...(memory?.pieceMoves || {}) } };
  const piece = String(move?.piece || "").toLowerCase();
  if (piece && Object.prototype.hasOwnProperty.call(next.pieceMoves, piece)) {
    next.pieceMoves[piece] = Number(next.pieceMoves[piece] || 0) + 1;
  }
  if (move?.captured) next.capturesPlayed = Number(next.capturesPlayed || 0) + 1;
  else next.quietMovesPlayed = Number(next.quietMovesPlayed || 0) + 1;
  return next;
}

export function recordWizardGameMemory(memory, summary = {}) {
  const next = {
    ...createDefaultWizardMemory(),
    ...memory,
    openings: { ...(memory?.openings || {}) },
    pieceMoves: { ...createDefaultWizardMemory().pieceMoves, ...(memory?.pieceMoves || {}) },
    lastResults: Array.isArray(memory?.lastResults) ? [...memory.lastResults] : []
  };
  next.gamesPlayed += 1;
  if (summary.opening) {
    const key = String(summary.opening).trim();
    if (key) next.openings[key] = Number(next.openings[key] || 0) + 1;
  }
  next.sacrifices += Number(summary.sacrifices || 0);
  next.blunders += Number(summary.blunders || 0);
  next.brilliantMoves += Number(summary.brilliantMoves || 0);
  next.lastResults.unshift({
    result: summary.result || "unknown",
    opening: summary.opening || "",
    timestamp: new Date().toISOString()
  });
  next.lastResults = next.lastResults.slice(0, 12);
  return next;
}

export function summarizeWizardHabits(memory = {}) {
  const openings = Object.entries(memory.openings || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  const favoriteOpening = openings[0]?.[0] || "";
  const favoritePiece = Object.entries(memory.pieceMoves || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || "";
  const captures = Number(memory.capturesPlayed || 0);
  const quiet = Number(memory.quietMovesPlayed || 0);
  const aggressionRatio = captures + quiet > 0 ? captures / (captures + quiet) : 0;
  return {
    favoriteOpening,
    favoritePiece,
    aggressionRatio,
    gamesPlayed: Number(memory.gamesPlayed || 0)
  };
}
