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
      <circle cx="64" cy="38" r="13" />
      <path d="M48 64 Q64 51 80 64 L76 100 H52 Z" />
      <rect x="44" y="100" width="40" height="8" rx="3" />
    `;
  }
  if (piece === "n") {
    return `
      <path d="M44 102 L44 75 Q45 56 64 46 L80 37 L90 50 L80 62 L86 73 L88 102 Z" />
      <circle cx="72" cy="54" r="3.4" />
      <rect x="41" y="102" width="48" height="8" rx="3" />
    `;
  }
  if (piece === "b") {
    return `
      <ellipse cx="64" cy="37" rx="10" ry="12" />
      <path d="M64 49 L72 64 L64 78 L56 64 Z" />
      <ellipse cx="64" cy="82" rx="18" ry="20" />
      <rect x="46" y="100" width="36" height="8" rx="3" />
    `;
  }
  if (piece === "r") {
    return `
      <rect x="44" y="28" width="40" height="12" rx="2" />
      <rect x="48" y="22" width="8" height="8" rx="1" />
      <rect x="60" y="20" width="8" height="10" rx="1" />
      <rect x="72" y="22" width="8" height="8" rx="1" />
      <rect x="50" y="42" width="28" height="56" rx="4" />
      <rect x="42" y="100" width="44" height="8" rx="3" />
    `;
  }
  if (piece === "q") {
    return `
      <circle cx="44" cy="30" r="5" />
      <circle cx="64" cy="24" r="5" />
      <circle cx="84" cy="30" r="5" />
      <path d="M42 40 L52 68 L76 68 L86 40 Z" />
      <ellipse cx="64" cy="80" rx="20" ry="19" />
      <rect x="42" y="100" width="44" height="8" rx="3" />
    `;
  }
  return `
    <rect x="60" y="20" width="8" height="24" rx="2" />
    <rect x="52" y="28" width="24" height="8" rx="2" />
    <path d="M48 48 H80 L74 80 H54 Z" />
    <ellipse cx="64" cy="84" rx="18" ry="16" />
    <rect x="44" y="100" width="40" height="8" rx="3" />
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
    <linearGradient id="mainFill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${glow}" />
      <stop offset="100%" stop-color="${fill}" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <circle cx="64" cy="74" r="48" fill="rgba(0,0,0,0.06)" />
  <g fill="url(#mainFill)" stroke="${outline}" stroke-width="3">
    ${pieceMarkup(piece)}
  </g>
  <rect x="40" y="108" width="48" height="6" rx="3" fill="${accent}" />
  <text x="64" y="121" text-anchor="middle" font-size="11" font-family="Verdana,Segoe UI,sans-serif" fill="${outline}" opacity="0.86">${skin.icon}</text>
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

