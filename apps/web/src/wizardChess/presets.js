export const DIFFICULTY_PRESETS = [
  { id: "casual", label: "Casual", moveTimeMs: 350, summary: "Forgiving, chatty, and beginner-friendly." },
  { id: "clever", label: "Clever", moveTimeMs: 550, summary: "Balanced play with tactical pressure." },
  { id: "sharp", label: "Sharp", moveTimeMs: 900, summary: "Punchy tactical style with fewer mistakes." },
  { id: "merciless", label: "Merciless", moveTimeMs: 1350, summary: "Very strong engine discipline." },
  { id: "theatrical_genius", label: "Theatrical Genius", moveTimeMs: 1200, summary: "Elite play with dramatic flair." }
];

export const PERSONALITY_MODES = [
  { id: "sorceress", label: "Sorceress", description: "Elegant, magical, amused." },
  { id: "playful_rival", label: "Playful Rival", description: "Teasing, competitive, fun." },
  { id: "coach", label: "Coach", description: "Helpful and insight-forward." },
  { id: "dark_narrator", label: "Dark Narrator", description: "Mythic and intense." }
];

export const DEFAULT_DIFFICULTY = "clever";
export const DEFAULT_PERSONALITY_MODE = "playful_rival";

export function resolveDifficultyPreset(id = "") {
  const normalized = String(id || "").trim().toLowerCase().replace(/\s+/g, "_");
  return DIFFICULTY_PRESETS.find(item => item.id === normalized) || DIFFICULTY_PRESETS[1];
}

export function resolvePersonalityMode(id = "") {
  const normalized = String(id || "").trim().toLowerCase().replace(/\s+/g, "_");
  return PERSONALITY_MODES.find(item => item.id === normalized) || PERSONALITY_MODES[1];
}
