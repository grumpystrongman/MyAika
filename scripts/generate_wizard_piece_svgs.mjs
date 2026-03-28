import fs from "node:fs";
import path from "node:path";

const OUT_ROOT = path.resolve("apps/web/public/wizard-assets/pieces");

const SKINS = {
  mythic_realms: { primary: "#d6b17c", secondary: "#6e4a2f", glow: "#ffd9a1", icon: "MR" },
  starward_legions: { primary: "#8db5ff", secondary: "#213f70", glow: "#9de4ff", icon: "SL" },
  druidic_conclave: { primary: "#9ad8a7", secondary: "#2f5d43", glow: "#bafad3", icon: "DC" },
  occult_wardens: { primary: "#c09ef5", secondary: "#3d2e56", glow: "#e2ccff", icon: "OW" },
  frontier_fleet: { primary: "#c7d4e8", secondary: "#3b4f68", glow: "#f0f7ff", icon: "FF" },
  iron_rebels: { primary: "#d7a36a", secondary: "#6d4026", glow: "#ffd7ab", icon: "IR" },
  medieval_order: { primary: "#d5c48d", secondary: "#574838", glow: "#fff0be", icon: "MO" },
  graveborn_horde: { primary: "#86bf7e", secondary: "#31492d", glow: "#c8fbbf", icon: "GH" },
  wasteland_wardens: { primary: "#c8b68a", secondary: "#4d4232", glow: "#ffe6b0", icon: "WW" },
  irradiated_raiders: { primary: "#b3d96f", secondary: "#3d4d28", glow: "#dfff9d", icon: "RR" }
};

const PIECES = ["p", "n", "b", "r", "q", "k"];
const COLORS = ["white", "black"];

function adjustHex(hex, amount = 0) {
  const clean = String(hex || "#000000").replace("#", "");
  const num = Number.parseInt(clean, 16);
  if (!Number.isFinite(num)) return "#000000";
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function pieceMarkup(piece) {
  if (piece === "p") {
    return `
      <circle cx="64" cy="33" r="11" />
      <path d="M51 51 Q64 45 77 51 L82 78 Q64 84 46 78 Z" />
      <path d="M52 77 L76 77 L79 97 Q64 104 49 97 Z" />
      <path d="M49 63 H79" stroke-width="2.2" stroke-linecap="round" fill="none" />
    `;
  }
  if (piece === "n") {
    return `
      <path d="M46 100 L46 74 Q47 57 61 48 L80 34 L90 47 L82 60 L88 70 L89 98 Q68 104 46 100 Z" />
      <path d="M63 50 L78 42 L80 51 L67 58 Z" />
      <circle cx="72" cy="53" r="2.8" />
      <path d="M52 82 Q64 74 78 82" stroke-width="2.2" stroke-linecap="round" fill="none" />
    `;
  }
  if (piece === "b") {
    return `
      <path d="M64 22 L73 38 L64 56 L55 38 Z" />
      <ellipse cx="64" cy="38" rx="10" ry="12" />
      <path d="M64 48 Q76 58 74 74 Q64 82 54 74 Q52 58 64 48 Z" />
      <path d="M58 66 L70 66" stroke-width="2.2" stroke-linecap="round" fill="none" />
      <path d="M64 56 L64 93" stroke-width="2.2" stroke-linecap="round" fill="none" />
    `;
  }
  if (piece === "r") {
    return `
      <rect x="46" y="24" width="36" height="12" rx="2" />
      <rect x="48" y="18" width="7" height="8" rx="1" />
      <rect x="60" y="16" width="8" height="10" rx="1" />
      <rect x="73" y="18" width="7" height="8" rx="1" />
      <path d="M50 38 H78 L74 90 H54 Z" />
      <path d="M57 48 V85 M64 46 V88 M71 48 V85" stroke-width="2.1" stroke-linecap="round" fill="none" />
    `;
  }
  if (piece === "q") {
    return `
      <circle cx="44" cy="30" r="4.2" />
      <circle cx="64" cy="22" r="4.8" />
      <circle cx="84" cy="30" r="4.2" />
      <path d="M42 39 L50 66 L64 56 L78 66 L86 39 Z" />
      <path d="M50 67 H78 L75 92 Q64 98 53 92 Z" />
      <path d="M56 74 H72 M58 82 H70" stroke-width="2.1" stroke-linecap="round" fill="none" />
    `;
  }
  return `
    <rect x="60" y="19" width="8" height="24" rx="2" />
    <rect x="52" y="27" width="24" height="8" rx="2" />
    <path d="M49 45 H79 L74 66 H54 Z" />
    <path d="M53 66 H75 L73 92 Q64 98 55 92 Z" />
    <path d="M58 74 H70 M60 82 H68" stroke-width="2.1" stroke-linecap="round" fill="none" />
  `;
}

function renderSvg({ skinId, piece, color }) {
  const skin = SKINS[skinId];
  const shade = color === "white" ? 12 : -26;
  const fill = adjustHex(skin.primary, shade);
  const accent = adjustHex(skin.secondary, shade / 2);
  const glow = adjustHex(skin.glow, shade / 2);
  const outline = color === "white" ? "#0f1628" : "#e7f0ff";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="pedestal" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${adjustHex(accent, 24)}" />
      <stop offset="100%" stop-color="${adjustHex(accent, -18)}" />
    </linearGradient>
    <linearGradient id="mainFill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${glow}" />
      <stop offset="100%" stop-color="${fill}" />
    </linearGradient>
    <linearGradient id="armorEdge" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${adjustHex(glow, 24)}" stop-opacity="0.8" />
      <stop offset="100%" stop-color="${adjustHex(fill, -18)}" stop-opacity="0.05" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <ellipse cx="64" cy="104" rx="34" ry="11" fill="rgba(0,0,0,0.28)" />
  <path d="M32 101 H96 L90 112 H38 Z" fill="url(#pedestal)" stroke="${outline}" stroke-width="2.4" />
  <path d="M36 96 H92 L88 102 H40 Z" fill="${adjustHex(accent, 18)}" stroke="${outline}" stroke-width="1.8" />
  <g fill="url(#mainFill)" stroke="${outline}" stroke-width="3">
    ${pieceMarkup(piece)}
  </g>
  <path d="M44 32 Q64 14 84 32" stroke="url(#armorEdge)" stroke-width="2.3" fill="none" />
  <path d="M50 56 Q64 46 78 56" stroke="url(#armorEdge)" stroke-width="2.1" fill="none" />
  <text x="64" y="121" text-anchor="middle" font-size="11" font-family="Verdana,Segoe UI,sans-serif" fill="${outline}" opacity="0.92">${skin.icon}</text>
  <circle cx="64" cy="15" r="5" fill="${glow}" filter="url(#glow)" />
</svg>`;
}

function writePieceSvgs() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  for (const skinId of Object.keys(SKINS)) {
    const skinDir = path.join(OUT_ROOT, skinId);
    fs.mkdirSync(skinDir, { recursive: true });
    for (const color of COLORS) {
      for (const piece of PIECES) {
        const content = renderSvg({ skinId, piece, color });
        const file = path.join(skinDir, `${color}_${piece}.svg`);
        fs.writeFileSync(file, content, "utf8");
      }
    }
  }
}

writePieceSvgs();
console.log(`Generated wizard piece SVGs in ${OUT_ROOT}`);
