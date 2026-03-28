const DEFAULT_PIECE_LABELS = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King"
};

const PIECE_CODES = ["p", "n", "b", "r", "q", "k"];

function dualLabels(white, black) {
  return { white, black };
}

export const UNIVERSE_PACKS = [
  {
    id: "mythic_realms",
    label: "Mythic Realms",
    summary: "Heroic swords, old kingdoms, mountain wars.",
    boardTheme: "obsidian_hall",
    armyTheme: "knights",
    whiteSkin: "mythic_realms",
    blackSkin: "mythic_realms",
    strikeVerb: "blade rush",
    finisherVerb: "crownbreak",
    pieceLabels: dualLabels(
      { p: "Hearthguard", n: "Rider", b: "Lorewarden", r: "Bastion", q: "High Regent", k: "Crownlord" },
      { p: "Hearthguard", n: "Rider", b: "Lorewarden", r: "Bastion", q: "High Regent", k: "Crownlord" }
    )
  },
  {
    id: "starward_legions",
    label: "Starward Legions",
    summary: "Fleet command, plasma clashes, orbital tactics.",
    boardTheme: "storm_citadel",
    armyTheme: "spectral",
    whiteSkin: "starward_legions",
    blackSkin: "starward_legions",
    strikeVerb: "plasma burst",
    finisherVerb: "orbital collapse",
    pieceLabels: dualLabels(
      { p: "Cadet", n: "Interceptor", b: "Sage Droid", r: "Battlestation", q: "Grand Admiral", k: "Command Core" },
      { p: "Cadet", n: "Interceptor", b: "Sage Droid", r: "Battlestation", q: "Grand Admiral", k: "Command Core" }
    )
  },
  {
    id: "druidic_conclave",
    label: "Druidic Conclave",
    summary: "Runes, storms, circles of primal power.",
    boardTheme: "sunken_temple",
    armyTheme: "elves",
    whiteSkin: "druidic_conclave",
    blackSkin: "druidic_conclave",
    strikeVerb: "thorn surge",
    finisherVerb: "worldroot bind",
    pieceLabels: dualLabels(
      { p: "Acolyte", n: "Stag Rider", b: "Stone Seer", r: "Grove Tower", q: "Arch Druid", k: "Elder Oakheart" },
      { p: "Acolyte", n: "Stag Rider", b: "Stone Seer", r: "Grove Tower", q: "Arch Druid", k: "Elder Oakheart" }
    )
  },
  {
    id: "occult_wardens",
    label: "Occult Wardens",
    summary: "Urban sigils, hidden wars, midnight protocol.",
    boardTheme: "ember_forge",
    armyTheme: "necromancers",
    whiteSkin: "occult_wardens",
    blackSkin: "occult_wardens",
    strikeVerb: "sigil break",
    finisherVerb: "veil sever",
    pieceLabels: dualLabels(
      { p: "Initiate", n: "Nightrunner", b: "Hex Scholar", r: "Ward Pillar", q: "Mistress Arcana", k: "Prime Warden" },
      { p: "Initiate", n: "Nightrunner", b: "Hex Scholar", r: "Ward Pillar", q: "Mistress Arcana", k: "Prime Warden" }
    )
  },
  {
    id: "frontier_fleet",
    label: "Frontier Fleet",
    summary: "Exploration banners and disciplined formations.",
    boardTheme: "frost_keep",
    armyTheme: "dwarves",
    whiteSkin: "frontier_fleet",
    blackSkin: "frontier_fleet",
    strikeVerb: "warp lance",
    finisherVerb: "starlight verdict",
    pieceLabels: dualLabels(
      { p: "Ensign", n: "Scout Wing", b: "Science Marshal", r: "Star Dock", q: "Flag Captain", k: "Fleet Marshal" },
      { p: "Ensign", n: "Scout Wing", b: "Science Marshal", r: "Star Dock", q: "Flag Captain", k: "Fleet Marshal" }
    )
  },
  {
    id: "iron_rebels",
    label: "Iron Rebels",
    summary: "Scrap-forged armies and shock doctrine.",
    boardTheme: "ember_forge",
    armyTheme: "orks",
    whiteSkin: "iron_rebels",
    blackSkin: "iron_rebels",
    strikeVerb: "shock ram",
    finisherVerb: "reactor crush",
    pieceLabels: dualLabels(
      { p: "Skirmisher", n: "Warbike", b: "Breaker", r: "Siege Rig", q: "Riot Matron", k: "Iron Warlord" },
      { p: "Skirmisher", n: "Warbike", b: "Breaker", r: "Siege Rig", q: "Riot Matron", k: "Iron Warlord" }
    )
  },
  {
    id: "medieval_vs_zombies",
    label: "Medieval vs Zombies",
    summary: "Crownsteel battalions against graveborn swarms.",
    boardTheme: "moonlit_glade",
    armyTheme: "knights",
    whiteSkin: "medieval_order",
    blackSkin: "graveborn_horde",
    strikeVerb: "holy steel",
    finisherVerb: "cathedral purge",
    pieceLabels: dualLabels(
      { p: "Squire", n: "Lancer", b: "Chaplain", r: "Keep Tower", q: "War Matriarch", k: "High Sovereign" },
      { p: "Shambler", n: "Ghoul Rider", b: "Plague Seer", r: "Bone Totem", q: "Crypt Empress", k: "Lich Regent" }
    )
  },
  {
    id: "wasteland_war",
    label: "Wasteland War",
    summary: "Post-collapse factions and reactor age warfare.",
    boardTheme: "storm_citadel",
    armyTheme: "orks",
    whiteSkin: "wasteland_wardens",
    blackSkin: "irradiated_raiders",
    strikeVerb: "scrap volley",
    finisherVerb: "reactor verdict",
    pieceLabels: dualLabels(
      { p: "Scav", n: "Rigger", b: "Tech Monk", r: "Bulwark Rig", q: "Dust Marshal", k: "Vault Commander" },
      { p: "Mutant", n: "Howler", b: "Rad Priest", r: "Jury Bastion", q: "Warlady Ash", k: "Overboss Ruin" }
    )
  }
];

export const DEFAULT_UNIVERSE_PACK_ID = UNIVERSE_PACKS[0].id;

export function resolveUniversePack(id = "") {
  const key = String(id || "").trim().toLowerCase();
  return UNIVERSE_PACKS.find(item => item.id === key) || UNIVERSE_PACKS[0];
}

export function resolveUniversePieceLabel(packId = "", color = "w", piece = "p") {
  const pack = resolveUniversePack(packId);
  const side = color === "w" || color === "white" ? "white" : "black";
  const key = String(piece || "p").toLowerCase();
  return pack.pieceLabels?.[side]?.[key] || DEFAULT_PIECE_LABELS[key] || "Unit";
}

export function resolveUniversePieceSprite(packId = "", color = "w", piece = "p") {
  const pack = resolveUniversePack(packId);
  const side = color === "w" || color === "white" ? "white" : "black";
  const key = String(piece || "p").toLowerCase();
  if (!PIECE_CODES.includes(key)) return "";
  const skin = side === "white" ? pack.whiteSkin : pack.blackSkin;
  return `/wizard-assets/pieces/${skin}/${side}_${key}.svg`;
}

