export const BOARD_THEMES = [
  {
    id: "obsidian_hall",
    label: "Obsidian Hall",
    summary: "Cold moonlight over black stone.",
    pageGradient: "radial-gradient(1300px 760px at 8% 0%, rgba(80, 112, 180, 0.26), transparent 60%), radial-gradient(900px 620px at 92% 6%, rgba(246, 145, 84, 0.14), transparent 62%), linear-gradient(145deg, #04070f 0%, #0a1120 46%, #0b121a 100%)",
    boardLight: "#d8c49e",
    boardDark: "#5f6578",
    boardBorder: "rgba(140, 157, 232, 0.35)",
    aura: "rgba(112, 187, 255, 0.18)",
    scenePalette: {
      fog: 0x070b13,
      key: 0x6ac6ff,
      rim: 0xff9a5e,
      ambient: 0x7d94c7
    }
  },
  {
    id: "ember_forge",
    label: "Ember Forge",
    summary: "Molten light and iron smoke.",
    pageGradient: "radial-gradient(1200px 740px at 14% 2%, rgba(255, 120, 69, 0.25), transparent 60%), radial-gradient(860px 580px at 90% 8%, rgba(255, 210, 120, 0.16), transparent 64%), linear-gradient(150deg, #120805 0%, #21140a 50%, #111013 100%)",
    boardLight: "#deb27a",
    boardDark: "#694532",
    boardBorder: "rgba(255, 163, 102, 0.42)",
    aura: "rgba(255, 152, 91, 0.18)",
    scenePalette: {
      fog: 0x1a0d08,
      key: 0xffa156,
      rim: 0xff5d2e,
      ambient: 0xd09073
    }
  },
  {
    id: "moonlit_glade",
    label: "Moonlit Glade",
    summary: "Mystic forest haze and silver runes.",
    pageGradient: "radial-gradient(1300px 760px at 8% 0%, rgba(104, 188, 141, 0.24), transparent 62%), radial-gradient(860px 590px at 88% 6%, rgba(152, 221, 255, 0.16), transparent 64%), linear-gradient(142deg, #06110d 0%, #0d1d1b 46%, #071116 100%)",
    boardLight: "#d7dbc2",
    boardDark: "#4f6757",
    boardBorder: "rgba(126, 214, 176, 0.36)",
    aura: "rgba(129, 224, 189, 0.18)",
    scenePalette: {
      fog: 0x061510,
      key: 0x8de0bc,
      rim: 0x9fd6ff,
      ambient: 0x7aa98f
    }
  },
  {
    id: "frost_keep",
    label: "Frost Keep",
    summary: "Ice haze, steel echoes, northern wind.",
    pageGradient: "radial-gradient(1250px 760px at 10% 0%, rgba(170, 216, 255, 0.25), transparent 60%), radial-gradient(900px 620px at 90% 8%, rgba(172, 187, 255, 0.14), transparent 64%), linear-gradient(142deg, #071018 0%, #0c1c2e 46%, #0a121b 100%)",
    boardLight: "#d8e0ea",
    boardDark: "#5f7388",
    boardBorder: "rgba(143, 192, 235, 0.38)",
    aura: "rgba(149, 220, 255, 0.2)",
    scenePalette: {
      fog: 0x08121e,
      key: 0x9fdcff,
      rim: 0x8db6ff,
      ambient: 0x89a8d2
    }
  },
  {
    id: "storm_citadel",
    label: "Storm Citadel",
    summary: "Thunderglass towers and electric rain.",
    pageGradient: "radial-gradient(1320px 780px at 8% -4%, rgba(115, 167, 255, 0.26), transparent 62%), radial-gradient(920px 600px at 90% 10%, rgba(138, 255, 241, 0.13), transparent 62%), linear-gradient(140deg, #060b16 0%, #0b1730 45%, #060c17 100%)",
    boardLight: "#c9d9e8",
    boardDark: "#405a79",
    boardBorder: "rgba(132, 184, 244, 0.4)",
    aura: "rgba(117, 188, 255, 0.2)",
    scenePalette: {
      fog: 0x071322,
      key: 0x7dd2ff,
      rim: 0x79a4ff,
      ambient: 0x819fd6
    }
  },
  {
    id: "sunken_temple",
    label: "Sunken Temple",
    summary: "Ancient runes beneath emerald waterlight.",
    pageGradient: "radial-gradient(1260px 760px at 12% 0%, rgba(90, 201, 170, 0.24), transparent 60%), radial-gradient(900px 620px at 92% 8%, rgba(169, 232, 168, 0.15), transparent 64%), linear-gradient(145deg, #041210 0%, #0a2521 44%, #081915 100%)",
    boardLight: "#cfd8b0",
    boardDark: "#3c6957",
    boardBorder: "rgba(122, 214, 176, 0.37)",
    aura: "rgba(126, 219, 185, 0.18)",
    scenePalette: {
      fog: 0x061914,
      key: 0x79dfbe,
      rim: 0xb6e88d,
      ambient: 0x75a88c
    }
  }
];

export const ARMY_THEMES = [
  {
    id: "knights",
    label: "Knights of Dawn",
    summary: "Disciplined steel and heavy shields.",
    whiteFilter: "drop-shadow(0 0 5px rgba(218,238,255,.52))",
    blackFilter: "hue-rotate(12deg) saturate(1.15) brightness(0.86) drop-shadow(0 0 5px rgba(255,185,123,.38))",
    glyphs: { p: "⚔", n: "🛡", b: "✠", r: "🗼", q: "♕", k: "♔" },
    battleProfile: {
      accent: "#7cc7ff",
      impact: "#ffca84",
      strikeVerb: "shield bash",
      finisher: "banner strike"
    }
  },
  {
    id: "elves",
    label: "Moon Elves",
    summary: "Swift lines, silver bows, arcane grace.",
    whiteFilter: "hue-rotate(135deg) saturate(1.25) brightness(1.07) drop-shadow(0 0 6px rgba(127,255,208,.42))",
    blackFilter: "hue-rotate(165deg) saturate(1.3) brightness(0.82) drop-shadow(0 0 6px rgba(61,205,169,.38))",
    glyphs: { p: "🍃", n: "🦌", b: "🏹", r: "🌲", q: "✨", k: "🌙" },
    battleProfile: {
      accent: "#8be7cb",
      impact: "#b7f5cf",
      strikeVerb: "moon volley",
      finisher: "starlit cut"
    }
  },
  {
    id: "orks",
    label: "Iron Orks",
    summary: "Brutal charges and hammer blows.",
    whiteFilter: "hue-rotate(58deg) saturate(1.42) brightness(0.98) drop-shadow(0 0 6px rgba(156,238,96,.42))",
    blackFilter: "hue-rotate(22deg) saturate(1.56) brightness(0.72) drop-shadow(0 0 6px rgba(112,177,58,.46))",
    glyphs: { p: "🪓", n: "🐗", b: "⚒", r: "⛓", q: "💥", k: "☠" },
    battleProfile: {
      accent: "#9de35f",
      impact: "#ff9659",
      strikeVerb: "warhammer crush",
      finisher: "warlord cleave"
    }
  },
  {
    id: "spectral",
    label: "Spectral Court",
    summary: "Ghost-fire, echoes, and cursed crowns.",
    whiteFilter: "hue-rotate(210deg) saturate(1.3) brightness(1.08) drop-shadow(0 0 8px rgba(142,163,255,.55))",
    blackFilter: "hue-rotate(232deg) saturate(1.55) brightness(0.76) drop-shadow(0 0 8px rgba(132,104,255,.48))",
    glyphs: { p: "☄", n: "☾", b: "✶", r: "⛧", q: "🜂", k: "♛" },
    battleProfile: {
      accent: "#90a9ff",
      impact: "#d4a0ff",
      strikeVerb: "phantom rupture",
      finisher: "void eclipse"
    }
  },
  {
    id: "dwarves",
    label: "Runeforged Dwarves",
    summary: "Anvils, runes, and mountain discipline.",
    whiteFilter: "hue-rotate(18deg) saturate(1.2) brightness(1.06) drop-shadow(0 0 6px rgba(255,192,129,.42))",
    blackFilter: "hue-rotate(0deg) saturate(1.25) brightness(0.78) drop-shadow(0 0 6px rgba(210,132,89,.45))",
    glyphs: { p: "⛏", n: "🐏", b: "ᛟ", r: "🏔", q: "🜚", k: "♚" },
    battleProfile: {
      accent: "#ffc17e",
      impact: "#ffd884",
      strikeVerb: "runic slam",
      finisher: "forgequake"
    }
  },
  {
    id: "necromancers",
    label: "Necromancer Cabal",
    summary: "Rot, ritual, and relentless summons.",
    whiteFilter: "hue-rotate(255deg) saturate(1.32) brightness(1.04) drop-shadow(0 0 6px rgba(194,153,255,.44))",
    blackFilter: "hue-rotate(265deg) saturate(1.56) brightness(0.69) drop-shadow(0 0 6px rgba(148,94,214,.5))",
    glyphs: { p: "☠", n: "☣", b: "✟", r: "⚰", q: "🜏", k: "♛" },
    battleProfile: {
      accent: "#b497ff",
      impact: "#77f0c9",
      strikeVerb: "gravebind strike",
      finisher: "soul unmaking"
    }
  }
];

const defaultBoard = BOARD_THEMES[0];
const defaultArmy = ARMY_THEMES[0];

export function resolveBoardTheme(id = "") {
  const normalized = String(id || "").trim().toLowerCase();
  return BOARD_THEMES.find(item => item.id === normalized) || defaultBoard;
}

export function resolveArmyTheme(id = "") {
  const normalized = String(id || "").trim().toLowerCase();
  return ARMY_THEMES.find(item => item.id === normalized) || defaultArmy;
}

export function resolveArmyGlyph(themeId = "", piece = "p") {
  const army = resolveArmyTheme(themeId);
  const p = String(piece || "p").toLowerCase();
  return army.glyphs?.[p] || "✦";
}

export function resolveArmyBattleProfile(themeId = "") {
  const army = resolveArmyTheme(themeId);
  return army.battleProfile || {
    accent: "#82c6ff",
    impact: "#ffc990",
    strikeVerb: "arcane strike",
    finisher: "final spell"
  };
}
