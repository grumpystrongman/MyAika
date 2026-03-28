const OPENING_BOOK = [
  { sequence: ["e2e4", "c7c5"], name: "Sicilian Defense" },
  { sequence: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"], name: "Ruy Lopez" },
  { sequence: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"], name: "Italian Game" },
  { sequence: ["e2e4", "e7e6"], name: "French Defense" },
  { sequence: ["e2e4", "c7c6"], name: "Caro-Kann Defense" },
  { sequence: ["d2d4", "d7d5", "c2c4"], name: "Queen's Gambit" },
  { sequence: ["d2d4", "g8f6", "c2c4", "g7g6"], name: "King's Indian Defense" },
  { sequence: ["d2d4", "g8f6", "c2c4", "e7e6"], name: "Nimzo/Indian Family" },
  { sequence: ["c2c4", "e7e5"], name: "English Opening" },
  { sequence: ["g1f3", "d7d5"], name: "Reti Setup" }
];

export function detectOpening(uciMoves = []) {
  if (!Array.isArray(uciMoves) || !uciMoves.length) return "";
  const normalized = uciMoves.map(move => String(move || "").trim().toLowerCase()).filter(Boolean);
  let matched = "";
  for (const entry of OPENING_BOOK) {
    if (entry.sequence.length > normalized.length) continue;
    let ok = true;
    for (let i = 0; i < entry.sequence.length; i += 1) {
      if (entry.sequence[i] !== normalized[i]) {
        ok = false;
        break;
      }
    }
    if (ok && entry.sequence.length >= (matched ? OPENING_BOOK.find(item => item.name === matched)?.sequence.length || 0 : 0)) {
      matched = entry.name;
    }
  }
  return matched;
}
