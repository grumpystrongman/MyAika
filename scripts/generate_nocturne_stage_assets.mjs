import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceFile = path.resolve(root, "apps/web/public/assets/aika/portraits/nocturne-human/base.png");
const outDir = path.resolve(root, "apps/web/public/assets/aika/stage/nocturne-human");
const configFile = path.join(outDir, "config.json");

const config = {
  baseImage: "/assets/aika/stage/nocturne-human/base.png",
  layers: {
    bodyShell: "/assets/aika/stage/nocturne-human/layer-body-shell.png",
    faceShell: "/assets/aika/stage/nocturne-human/layer-face-shell.png",
    hairBack: "/assets/aika/stage/nocturne-human/layer-hair-back.png",
    hairFront: "/assets/aika/stage/nocturne-human/layer-hair-front.png",
    eyeZone: "/assets/aika/stage/nocturne-human/layer-eye-zone.png",
    mouthCore: "/assets/aika/stage/nocturne-human/layer-mouth-core.png"
  },
  variants: {
    browLift: "/assets/aika/stage/nocturne-human/brow-lift.png",
    browKnit: "/assets/aika/stage/nocturne-human/brow-knit.png",
    eyeGloss: "/assets/aika/stage/nocturne-human/eye-gloss.png",
    mouthSoft: "/assets/aika/stage/nocturne-human/mouth-soft.png",
    mouthMedium: "/assets/aika/stage/nocturne-human/mouth-medium.png",
    mouthWide: "/assets/aika/stage/nocturne-human/mouth-wide.png",
    mouthRound: "/assets/aika/stage/nocturne-human/mouth-round.png",
    mouthClosedPress: "/assets/aika/stage/nocturne-human/mouth-closed-press.png",
    mouthLipBite: "/assets/aika/stage/nocturne-human/mouth-lip-bite.png",
    mouthEe: "/assets/aika/stage/nocturne-human/mouth-ee.png",
    mouthAh: "/assets/aika/stage/nocturne-human/mouth-ah.png",
    mouthOh: "/assets/aika/stage/nocturne-human/mouth-oh.png",
    mouthSibilant: "/assets/aika/stage/nocturne-human/mouth-sibilant.png",
    mouthTongue: "/assets/aika/stage/nocturne-human/mouth-tongue.png"
  },
  frame: {
    scale: 0.98,
    offsetX: 0,
    offsetY: 0.04
  },
  anchors: {
    leftBrow: { x: 0.314, y: 0.162, w: 0.124, h: 0.038 },
    rightBrow: { x: 0.56, y: 0.162, w: 0.124, h: 0.038 },
    leftEye: { x: 0.318, y: 0.215, w: 0.112, h: 0.04 },
    rightEye: { x: 0.565, y: 0.215, w: 0.112, h: 0.04 },
    mouth: { x: 0.424, y: 0.31, w: 0.154, h: 0.065 },
    face: { x: 0.274, y: 0.082, w: 0.45, h: 0.36 }
  }
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function softSvg(width, height, body) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="blurSoft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${(width * 0.008).toFixed(2)}" />
        </filter>
      </defs>
      <g filter="url(#blurSoft)">
        ${body}
      </g>
    </svg>
  `;
}

function featureSvg(width, height, body) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="softLine" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${(width * 0.0018).toFixed(2)}" />
        </filter>
      </defs>
      ${body}
    </svg>
  `;
}

function buildBodyMask(width, height) {
  return softSvg(width, height, `
    <ellipse cx="${width * 0.5}" cy="${height * 0.72}" rx="${width * 0.26}" ry="${height * 0.31}" fill="white" />
    <ellipse cx="${width * 0.28}" cy="${height * 0.8}" rx="${width * 0.09}" ry="${height * 0.22}" transform="rotate(-10 ${width * 0.28} ${height * 0.8})" fill="white" />
    <ellipse cx="${width * 0.73}" cy="${height * 0.83}" rx="${width * 0.09}" ry="${height * 0.21}" transform="rotate(10 ${width * 0.73} ${height * 0.83})" fill="white" />
    <ellipse cx="${width * 0.5}" cy="${height * 0.53}" rx="${width * 0.09}" ry="${height * 0.09}" fill="white" />
  `);
}

function buildFaceMask(width, height) {
  return softSvg(width, height, `
    <ellipse cx="${width * 0.5}" cy="${height * 0.25}" rx="${width * 0.15}" ry="${height * 0.15}" fill="white" />
    <ellipse cx="${width * 0.5}" cy="${height * 0.36}" rx="${width * 0.07}" ry="${height * 0.07}" fill="white" />
  `);
}

function buildHairBackMask(width, height) {
  return softSvg(width, height, `
    <ellipse cx="${width * 0.5}" cy="${height * 0.16}" rx="${width * 0.24}" ry="${height * 0.19}" fill="white" />
    <ellipse cx="${width * 0.39}" cy="${height * 0.23}" rx="${width * 0.11}" ry="${height * 0.11}" fill="white" />
    <ellipse cx="${width * 0.61}" cy="${height * 0.23}" rx="${width * 0.11}" ry="${height * 0.11}" fill="white" />
  `);
}

function buildHairFrontMask(width, height) {
  return softSvg(width, height, `
    <path d="M ${width * 0.31} ${height * 0.1} C ${width * 0.28} ${height * 0.16}, ${width * 0.31} ${height * 0.24}, ${width * 0.37} ${height * 0.3} C ${width * 0.39} ${height * 0.26}, ${width * 0.4} ${height * 0.21}, ${width * 0.39} ${height * 0.14} C ${width * 0.38} ${height * 0.09}, ${width * 0.35} ${height * 0.08}, ${width * 0.31} ${height * 0.1} Z" fill="white" />
    <path d="M ${width * 0.63} ${height * 0.11} C ${width * 0.66} ${height * 0.17}, ${width * 0.65} ${height * 0.24}, ${width * 0.61} ${height * 0.31} C ${width * 0.58} ${height * 0.27}, ${width * 0.58} ${height * 0.2}, ${width * 0.59} ${height * 0.14} C ${width * 0.6} ${height * 0.1}, ${width * 0.61} ${height * 0.09}, ${width * 0.63} ${height * 0.11} Z" fill="white" />
  `);
}

function buildEyeZoneMask(width, height) {
  return softSvg(width, height, `
    <ellipse cx="${width * 0.374}" cy="${height * 0.222}" rx="${width * 0.09}" ry="${height * 0.046}" fill="white" />
    <ellipse cx="${width * 0.621}" cy="${height * 0.222}" rx="${width * 0.09}" ry="${height * 0.046}" fill="white" />
    <ellipse cx="${width * 0.374}" cy="${height * 0.173}" rx="${width * 0.09}" ry="${height * 0.028}" fill="white" />
    <ellipse cx="${width * 0.621}" cy="${height * 0.173}" rx="${width * 0.09}" ry="${height * 0.028}" fill="white" />
  `);
}

function buildMouthMask(width, height) {
  return softSvg(width, height, `
    <ellipse cx="${width * 0.501}" cy="${height * 0.339}" rx="${width * 0.102}" ry="${height * 0.05}" fill="white" />
  `);
}

function buildBrowVariant(width, height, variant) {
  const lift = variant === "lift";
  const leftY = height * (lift ? 0.158 : 0.178);
  const rightY = leftY;
  return featureSvg(width, height, `
    <path d="M ${width * 0.312} ${leftY} Q ${width * 0.374} ${height * (lift ? 0.145 : 0.198)} ${width * 0.44} ${height * (lift ? 0.164 : 0.176)}" stroke="rgba(34,18,22,0.66)" stroke-width="${(width * 0.009).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softLine)" />
    <path d="M ${width * 0.555} ${rightY} Q ${width * 0.622} ${height * (lift ? 0.145 : 0.198)} ${width * 0.69} ${height * (lift ? 0.164 : 0.176)}" stroke="rgba(34,18,22,0.66)" stroke-width="${(width * 0.009).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softLine)" />
    ${lift ? "" : `<path d="M ${width * 0.486} ${height * 0.172} Q ${width * 0.5} ${height * 0.187} ${width * 0.514} ${height * 0.172}" stroke="rgba(72,36,42,0.24)" stroke-width="${(width * 0.005).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softLine)" />`}
  `);
}

function buildEyeGloss(width, height) {
  return featureSvg(width, height, `
    <ellipse cx="${width * 0.35}" cy="${height * 0.218}" rx="${width * 0.009}" ry="${height * 0.007}" fill="rgba(255,255,255,0.42)" filter="url(#softLine)" />
    <ellipse cx="${width * 0.596}" cy="${height * 0.218}" rx="${width * 0.009}" ry="${height * 0.007}" fill="rgba(255,255,255,0.42)" filter="url(#softLine)" />
    <ellipse cx="${width * 0.364}" cy="${height * 0.225}" rx="${width * 0.004}" ry="${height * 0.003}" fill="rgba(255,238,244,0.3)" filter="url(#softLine)" />
    <ellipse cx="${width * 0.61}" cy="${height * 0.225}" rx="${width * 0.004}" ry="${height * 0.003}" fill="rgba(255,238,244,0.3)" filter="url(#softLine)" />
  `);
}

function buildMouthVariant(width, height, type) {
  const cx = width * 0.501;
  const cy = height * 0.339;
  const lip = "rgba(111, 17, 34, 0.96)";
  const inner = "rgba(45, 8, 16, 0.82)";
  const skin = "rgba(229,203,195,0.72)";
  const shapes = {
    soft: `<ellipse cx="${cx}" cy="${cy}" rx="${width * 0.038}" ry="${height * 0.009}" fill="${lip}" filter="url(#softLine)" />`,
    medium: `<ellipse cx="${cx}" cy="${cy + height * 0.002}" rx="${width * 0.045}" ry="${height * 0.013}" fill="${lip}" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.003}" rx="${width * 0.031}" ry="${height * 0.007}" fill="${inner}" filter="url(#softLine)" />`,
    wide: `<ellipse cx="${cx}" cy="${cy + height * 0.004}" rx="${width * 0.052}" ry="${height * 0.02}" fill="${lip}" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.005}" rx="${width * 0.036}" ry="${height * 0.011}" fill="${inner}" filter="url(#softLine)" />`,
    round: `<ellipse cx="${cx}" cy="${cy + height * 0.004}" rx="${width * 0.028}" ry="${height * 0.018}" fill="${lip}" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.004}" rx="${width * 0.015}" ry="${height * 0.01}" fill="${inner}" filter="url(#softLine)" />`,
    closedPress: `<path d="M ${width * 0.452} ${cy} Q ${cx} ${cy + height * 0.006} ${width * 0.55} ${cy}" stroke="${lip}" stroke-width="${(width * 0.01).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softLine)" />`,
    lipBite: `<path d="M ${width * 0.454} ${cy} Q ${cx} ${cy + height * 0.012} ${width * 0.547} ${cy}" stroke="${lip}" stroke-width="${(width * 0.01).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.006}" rx="${width * 0.026}" ry="${height * 0.006}" fill="${skin}" filter="url(#softLine)" />`,
    ee: `<ellipse cx="${cx}" cy="${cy + height * 0.001}" rx="${width * 0.046}" ry="${height * 0.01}" fill="${lip}" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.001}" rx="${width * 0.032}" ry="${height * 0.004}" fill="${inner}" filter="url(#softLine)" />`,
    ah: `<ellipse cx="${cx}" cy="${cy + height * 0.004}" rx="${width * 0.043}" ry="${height * 0.018}" fill="${lip}" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.005}" rx="${width * 0.028}" ry="${height * 0.01}" fill="${inner}" filter="url(#softLine)" />`,
    oh: `<ellipse cx="${cx}" cy="${cy + height * 0.004}" rx="${width * 0.03}" ry="${height * 0.016}" fill="${lip}" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.004}" rx="${width * 0.018}" ry="${height * 0.009}" fill="${inner}" filter="url(#softLine)" />`,
    sibilant: `<path d="M ${width * 0.454} ${cy + height * 0.001} Q ${cx} ${cy - height * 0.002} ${width * 0.548} ${cy + height * 0.001}" stroke="${lip}" stroke-width="${(width * 0.009).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softLine)" /><path d="M ${width * 0.463} ${cy + height * 0.007} Q ${cx} ${cy + height * 0.011} ${width * 0.538} ${cy + height * 0.007}" stroke="${inner}" stroke-width="${(width * 0.005).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softLine)" />`,
    tongue: `<ellipse cx="${cx}" cy="${cy + height * 0.007}" rx="${width * 0.03}" ry="${height * 0.015}" fill="${lip}" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.01}" rx="${width * 0.017}" ry="${height * 0.006}" fill="rgba(187,88,108,0.8)" filter="url(#softLine)" /><ellipse cx="${cx}" cy="${cy + height * 0.006}" rx="${width * 0.02}" ry="${height * 0.009}" fill="${inner}" filter="url(#softLine)" />`
  };

  return featureSvg(width, height, shapes[type]);
}

async function writeMaskedLayer(sourcePath, outputPath, maskSvg) {
  await sharp(sourcePath)
    .ensureAlpha()
    .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
    .png()
    .toFile(outputPath);
}

async function writeOverlay(outputPath, svg) {
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function main() {
  ensureDir(outDir);
  fs.copyFileSync(sourceFile, path.join(outDir, "base.png"));
  const meta = await sharp(sourceFile).metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1536;

  await Promise.all([
    writeMaskedLayer(sourceFile, path.join(outDir, "layer-body-shell.png"), buildBodyMask(width, height)),
    writeMaskedLayer(sourceFile, path.join(outDir, "layer-face-shell.png"), buildFaceMask(width, height)),
    writeMaskedLayer(sourceFile, path.join(outDir, "layer-hair-back.png"), buildHairBackMask(width, height)),
    writeMaskedLayer(sourceFile, path.join(outDir, "layer-hair-front.png"), buildHairFrontMask(width, height)),
    writeMaskedLayer(sourceFile, path.join(outDir, "layer-eye-zone.png"), buildEyeZoneMask(width, height)),
    writeMaskedLayer(sourceFile, path.join(outDir, "layer-mouth-core.png"), buildMouthMask(width, height)),
    writeOverlay(path.join(outDir, "brow-lift.png"), buildBrowVariant(width, height, "lift")),
    writeOverlay(path.join(outDir, "brow-knit.png"), buildBrowVariant(width, height, "knit")),
    writeOverlay(path.join(outDir, "eye-gloss.png"), buildEyeGloss(width, height)),
    writeOverlay(path.join(outDir, "mouth-soft.png"), buildMouthVariant(width, height, "soft")),
    writeOverlay(path.join(outDir, "mouth-medium.png"), buildMouthVariant(width, height, "medium")),
    writeOverlay(path.join(outDir, "mouth-wide.png"), buildMouthVariant(width, height, "wide")),
    writeOverlay(path.join(outDir, "mouth-round.png"), buildMouthVariant(width, height, "round")),
    writeOverlay(path.join(outDir, "mouth-closed-press.png"), buildMouthVariant(width, height, "closedPress")),
    writeOverlay(path.join(outDir, "mouth-lip-bite.png"), buildMouthVariant(width, height, "lipBite")),
    writeOverlay(path.join(outDir, "mouth-ee.png"), buildMouthVariant(width, height, "ee")),
    writeOverlay(path.join(outDir, "mouth-ah.png"), buildMouthVariant(width, height, "ah")),
    writeOverlay(path.join(outDir, "mouth-oh.png"), buildMouthVariant(width, height, "oh")),
    writeOverlay(path.join(outDir, "mouth-sibilant.png"), buildMouthVariant(width, height, "sibilant")),
    writeOverlay(path.join(outDir, "mouth-tongue.png"), buildMouthVariant(width, height, "tongue"))
  ]);

  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
