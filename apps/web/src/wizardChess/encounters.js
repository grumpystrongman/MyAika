export const ENCOUNTERS = [
  {
    id: "custom",
    label: "Custom Duel",
    summary: "Manual setup for your own magical war.",
    preset: null
  },
  {
    id: "ember_warlord",
    label: "Ember Warlord",
    summary: "Ork legions in the forge.",
    preset: {
      difficulty: "merciless",
      personalityMode: "dark_narrator",
      boardTheme: "ember_forge",
      armyTheme: "orks"
    }
  },
  {
    id: "moon_court",
    label: "Moon Court",
    summary: "Elven precision under silver haze.",
    preset: {
      difficulty: "sharp",
      personalityMode: "sorceress",
      boardTheme: "moonlit_glade",
      armyTheme: "elves"
    }
  },
  {
    id: "frost_marshal",
    label: "Frost Marshal",
    summary: "Steel discipline in northern ruins.",
    preset: {
      difficulty: "clever",
      personalityMode: "coach",
      boardTheme: "frost_keep",
      armyTheme: "knights"
    }
  },
  {
    id: "void_archon",
    label: "Void Archon",
    summary: "Spectral court and ruthless lines.",
    preset: {
      difficulty: "theatrical_genius",
      personalityMode: "playful_rival",
      boardTheme: "obsidian_hall",
      armyTheme: "spectral"
    }
  },
  {
    id: "storm_regent",
    label: "Storm Regent",
    summary: "Lightning timing and tactical pressure.",
    preset: {
      difficulty: "sharp",
      personalityMode: "sorceress",
      boardTheme: "storm_citadel",
      armyTheme: "dwarves"
    }
  },
  {
    id: "crypt_oracle",
    label: "Crypt Oracle",
    summary: "Necromancy, traps, and long endgames.",
    preset: {
      difficulty: "merciless",
      personalityMode: "dark_narrator",
      boardTheme: "sunken_temple",
      armyTheme: "necromancers"
    }
  }
];

export function resolveEncounter(id = "") {
  const key = String(id || "").trim().toLowerCase();
  return ENCOUNTERS.find(item => item.id === key) || ENCOUNTERS[0];
}
