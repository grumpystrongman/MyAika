import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const root = process.cwd();
const outDir = path.resolve(root, "apps/web/public/assets/aika/portraits/nocturne-human");
const outputFile = path.join(outDir, "base.png");
const configFile = path.join(outDir, "config.json");
const promptFile = path.join(outDir, "generation-prompt.txt");
const variantsOnly = process.argv.includes("--variants-only");

const prompt = [
  "Original fictional adult virtual assistant portrait.",
  "A hyper-real cinematic gothic glamour hostess with pale luminous skin, raven-black sculpted hair, expressive dark eyes, refined dramatic eyeliner, and an elegant black velvet evening silhouette.",
  "Confident, warm, witty presence, controlled theatricality, sophisticated spooky elegance, tasteful and non-caricatured.",
  "Waist-up framing, frontal camera, subtle three-quarter head angle, soft studio haze, candlelit noir atmosphere, realistic skin texture, natural proportions, premium fashion editorial lighting.",
  "This must be an original character and must not resemble any real celebrity or copyrighted character."
].join(" ");

const config = {
  imageUrl: "/assets/aika/portraits/nocturne-human/base.png",
  skinTint: "rgba(229, 203, 195, 0.92)",
  shadowTint: "rgba(35, 20, 25, 0.58)",
  lipTint: "rgba(137, 22, 44, 0.9)",
  variants: {
    blink: "/assets/aika/portraits/nocturne-human/blink.png",
    browLift: "/assets/aika/portraits/nocturne-human/brow-lift.png",
    browKnit: "/assets/aika/portraits/nocturne-human/brow-knit.png",
    frontHair: "/assets/aika/portraits/nocturne-human/front-hair.png",
    eyeGloss: "/assets/aika/portraits/nocturne-human/eye-gloss.png",
    jawShadow: "/assets/aika/portraits/nocturne-human/jaw-shadow.png",
    makeupWarm: "/assets/aika/portraits/nocturne-human/makeup-warm.png",
    makeupConcerned: "/assets/aika/portraits/nocturne-human/makeup-concerned.png",
    makeupSurprised: "/assets/aika/portraits/nocturne-human/makeup-surprised.png",
    makeupTeasing: "/assets/aika/portraits/nocturne-human/makeup-teasing.png",
    cheekWarm: "/assets/aika/portraits/nocturne-human/cheek-warm.png",
    cheekConcerned: "/assets/aika/portraits/nocturne-human/cheek-concerned.png",
    cheekTeasing: "/assets/aika/portraits/nocturne-human/cheek-teasing.png",
    mouthSoft: "/assets/aika/portraits/nocturne-human/mouth-open-soft.png",
    mouthMedium: "/assets/aika/portraits/nocturne-human/mouth-open-medium.png",
    mouthWide: "/assets/aika/portraits/nocturne-human/mouth-open-wide.png",
    mouthRound: "/assets/aika/portraits/nocturne-human/mouth-round.png",
    mouthClosedPress: "/assets/aika/portraits/nocturne-human/mouth-closed-press.png",
    mouthLipBite: "/assets/aika/portraits/nocturne-human/mouth-lip-bite.png",
    mouthEe: "/assets/aika/portraits/nocturne-human/mouth-ee.png",
    mouthAh: "/assets/aika/portraits/nocturne-human/mouth-ah.png",
    mouthOh: "/assets/aika/portraits/nocturne-human/mouth-oh.png",
    mouthSibilant: "/assets/aika/portraits/nocturne-human/mouth-sibilant.png",
    mouthTongue: "/assets/aika/portraits/nocturne-human/mouth-tongue.png"
  },
  layers: {
    faceCore: "/assets/aika/portraits/nocturne-human/layer-face-core.png",
    eyeCore: "/assets/aika/portraits/nocturne-human/layer-eye-core.png",
    irisCore: "/assets/aika/portraits/nocturne-human/layer-iris-core.png",
    lidSoft: "/assets/aika/portraits/nocturne-human/layer-lid-soft.png",
    mouthCore: "/assets/aika/portraits/nocturne-human/layer-mouth-core.png",
    hairShell: "/assets/aika/portraits/nocturne-human/layer-hair-shell.png",
    fringeVeil: "/assets/aika/portraits/nocturne-human/layer-fringe-veil.png"
  },
  frame: {
    scale: 0.96,
    offsetX: 0,
    offsetY: 0.02
  },
  anchors: {
    leftBrow: { x: 0.286, y: 0.158, w: 0.142, h: 0.046 },
    rightBrow: { x: 0.542, y: 0.158, w: 0.142, h: 0.046 },
    leftEye: { x: 0.294, y: 0.214, w: 0.126, h: 0.05 },
    rightEye: { x: 0.55, y: 0.214, w: 0.126, h: 0.05 },
    mouth: { x: 0.424, y: 0.318, w: 0.154, h: 0.072 },
    face: { x: 0.235, y: 0.098, w: 0.53, h: 0.43 }
  }
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildBlinkSvg(width, height) {
  const { leftEye, rightEye } = config.anchors;
  const eyes = [leftEye, rightEye].map((eye) => ({
    x: eye.x * width,
    y: eye.y * height,
    w: eye.w * width,
    h: eye.h * height
  }));

  const lids = eyes.map((eye, index) => `
    <g id="eye-${index}">
      <ellipse cx="${(eye.x + eye.w * 0.5).toFixed(2)}" cy="${(eye.y + eye.h * 0.28).toFixed(2)}" rx="${(eye.w * 0.58).toFixed(2)}" ry="${(eye.h * 0.62).toFixed(2)}" fill="rgba(229,203,195,0.96)" filter="url(#softBlur)" />
      <ellipse cx="${(eye.x + eye.w * 0.5).toFixed(2)}" cy="${(eye.y + eye.h * 0.78).toFixed(2)}" rx="${(eye.w * 0.54).toFixed(2)}" ry="${(eye.h * 0.42).toFixed(2)}" fill="rgba(221,191,184,0.9)" filter="url(#softBlur)" />
      <path d="M ${(eye.x + eye.w * 0.14).toFixed(2)} ${(eye.y + eye.h * 0.55).toFixed(2)} Q ${(eye.x + eye.w * 0.5).toFixed(2)} ${(eye.y + eye.h * 0.46).toFixed(2)} ${(eye.x + eye.w * 0.86).toFixed(2)} ${(eye.y + eye.h * 0.56).toFixed(2)}" stroke="rgba(42,18,24,0.72)" stroke-width="${Math.max(2, eye.h * 0.1).toFixed(2)}" fill="none" stroke-linecap="round" />
    </g>
  `).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0025).toFixed(2)}" /></filter>
      </defs>
      ${lids}
    </svg>
  `;
}

function buildBrowSvg(width, height, variant) {
  const { leftBrow, rightBrow } = config.anchors;
  const brows = [leftBrow, rightBrow].map((brow, index) => ({
    x: brow.x * width,
    y: brow.y * height,
    w: brow.w * width,
    h: brow.h * height,
    direction: index === 0 ? -1 : 1
  }));

  const groups = brows.map((brow) => {
    if (variant === "lift") {
      return `
        <g>
          <path d="M ${(brow.x + brow.w * 0.08).toFixed(2)} ${(brow.y + brow.h * 0.76).toFixed(2)} Q ${(brow.x + brow.w * 0.5).toFixed(2)} ${(brow.y + brow.h * 0.12).toFixed(2)} ${(brow.x + brow.w * 0.92).toFixed(2)} ${(brow.y + brow.h * 0.66).toFixed(2)}" stroke="rgba(28,18,24,0.58)" stroke-width="${Math.max(2.4, brow.h * 0.28).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
          <path d="M ${(brow.x + brow.w * 0.12).toFixed(2)} ${(brow.y + brow.h * 0.82).toFixed(2)} Q ${(brow.x + brow.w * 0.5).toFixed(2)} ${(brow.y + brow.h * 0.3).toFixed(2)} ${(brow.x + brow.w * 0.88).toFixed(2)} ${(brow.y + brow.h * 0.72).toFixed(2)}" stroke="rgba(76,28,42,0.22)" stroke-width="${Math.max(1.8, brow.h * 0.2).toFixed(2)}" fill="none" stroke-linecap="round" />
        </g>
      `;
    }

    return `
      <g>
        <path d="M ${(brow.x + brow.w * 0.08).toFixed(2)} ${(brow.y + brow.h * 0.42).toFixed(2)} Q ${(brow.x + brow.w * 0.46).toFixed(2)} ${(brow.y + brow.h * (0.9 + brow.direction * 0.06)).toFixed(2)} ${(brow.x + brow.w * 0.92).toFixed(2)} ${(brow.y + brow.h * 0.46).toFixed(2)}" stroke="rgba(32,18,24,0.66)" stroke-width="${Math.max(2.8, brow.h * 0.32).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
        <path d="M ${(brow.x + brow.w * 0.34).toFixed(2)} ${(brow.y + brow.h * 0.18).toFixed(2)} Q ${(brow.x + brow.w * 0.5).toFixed(2)} ${(brow.y + brow.h * 0.74).toFixed(2)} ${(brow.x + brow.w * 0.66).toFixed(2)} ${(brow.y + brow.h * 0.18).toFixed(2)}" stroke="rgba(92,42,48,0.16)" stroke-width="${Math.max(1.2, brow.h * 0.12).toFixed(2)}" fill="none" stroke-linecap="round" />
      </g>
    `;
  }).join("");

  const face = config.anchors.face;
  const centerX = (face.x + face.w * 0.5) * width;
  const centerY = (face.y + face.h * 0.29) * height;
  const creaseOpacity = variant === "knit" ? 0.18 : 0;
  const crease = creaseOpacity
    ? `<path d="M ${(centerX - width * 0.01).toFixed(2)} ${(centerY - height * 0.02).toFixed(2)} Q ${centerX.toFixed(2)} ${(centerY + height * 0.018).toFixed(2)} ${(centerX + width * 0.01).toFixed(2)} ${(centerY - height * 0.02).toFixed(2)}" stroke="rgba(82,48,52,${creaseOpacity})" stroke-width="${(width * 0.004).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />`
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0018).toFixed(2)}" /></filter>
      </defs>
      ${groups}
      ${crease}
    </svg>
  `;
}

function buildFrontHairSvg(width, height) {
  const face = config.anchors.face;
  const fx = face.x * width;
  const fy = face.y * height;
  const fw = face.w * width;
  const fh = face.h * height;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="hairShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(12,10,14,0.84)" />
          <stop offset="65%" stop-color="rgba(18,12,18,0.28)" />
          <stop offset="100%" stop-color="rgba(18,12,18,0)" />
        </linearGradient>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0026).toFixed(2)}" /></filter>
      </defs>
      <path d="M ${(fx + fw * 0.15).toFixed(2)} ${(fy + fh * 0.02).toFixed(2)} C ${(fx + fw * 0.2).toFixed(2)} ${(fy - fh * 0.06).toFixed(2)}, ${(fx + fw * 0.32).toFixed(2)} ${(fy - fh * 0.04).toFixed(2)}, ${(fx + fw * 0.36).toFixed(2)} ${(fy + fh * 0.12).toFixed(2)} C ${(fx + fw * 0.38).toFixed(2)} ${(fy + fh * 0.26).toFixed(2)}, ${(fx + fw * 0.34).toFixed(2)} ${(fy + fh * 0.34).toFixed(2)}, ${(fx + fw * 0.3).toFixed(2)} ${(fy + fh * 0.42).toFixed(2)}" stroke="url(#hairShade)" stroke-width="${(fw * 0.09).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
      <path d="M ${(fx + fw * 0.84).toFixed(2)} ${(fy + fh * 0.03).toFixed(2)} C ${(fx + fw * 0.8).toFixed(2)} ${(fy - fh * 0.06).toFixed(2)}, ${(fx + fw * 0.68).toFixed(2)} ${(fy - fh * 0.05).toFixed(2)}, ${(fx + fw * 0.64).toFixed(2)} ${(fy + fh * 0.12).toFixed(2)} C ${(fx + fw * 0.62).toFixed(2)} ${(fy + fh * 0.28).toFixed(2)}, ${(fx + fw * 0.67).toFixed(2)} ${(fy + fh * 0.35).toFixed(2)}, ${(fx + fw * 0.71).toFixed(2)} ${(fy + fh * 0.43).toFixed(2)}" stroke="url(#hairShade)" stroke-width="${(fw * 0.1).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
      <path d="M ${(fx + fw * 0.49).toFixed(2)} ${(fy - fh * 0.02).toFixed(2)} C ${(fx + fw * 0.44).toFixed(2)} ${(fy + fh * 0.04).toFixed(2)}, ${(fx + fw * 0.46).toFixed(2)} ${(fy + fh * 0.11).toFixed(2)}, ${(fx + fw * 0.48).toFixed(2)} ${(fy + fh * 0.18).toFixed(2)}" stroke="rgba(18,12,16,0.54)" stroke-width="${(fw * 0.035).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
    </svg>
  `;
}

function buildEyeGlossSvg(width, height) {
  const eyes = [config.anchors.leftEye, config.anchors.rightEye].map((eye) => ({
    x: eye.x * width,
    y: eye.y * height,
    w: eye.w * width,
    h: eye.h * height
  }));
  const glints = eyes.map((eye) => `
    <g>
      <ellipse cx="${(eye.x + eye.w * 0.34).toFixed(2)}" cy="${(eye.y + eye.h * 0.34).toFixed(2)}" rx="${(eye.w * 0.08).toFixed(2)}" ry="${(eye.h * 0.1).toFixed(2)}" fill="rgba(255,255,255,0.48)" filter="url(#softBlur)" />
      <ellipse cx="${(eye.x + eye.w * 0.58).toFixed(2)}" cy="${(eye.y + eye.h * 0.4).toFixed(2)}" rx="${(eye.w * 0.04).toFixed(2)}" ry="${(eye.h * 0.05).toFixed(2)}" fill="rgba(255,240,240,0.34)" filter="url(#softBlur)" />
    </g>
  `).join("");
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0016).toFixed(2)}" /></filter>
      </defs>
      ${glints}
    </svg>
  `;
}

function buildJawShadowSvg(width, height) {
  const face = config.anchors.face;
  const fx = face.x * width;
  const fy = face.y * height;
  const fw = face.w * width;
  const fh = face.h * height;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <radialGradient id="jawShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(58,26,34,0.22)" />
          <stop offset="70%" stop-color="rgba(44,20,28,0.14)" />
          <stop offset="100%" stop-color="rgba(44,20,28,0)" />
        </radialGradient>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0055).toFixed(2)}" /></filter>
      </defs>
      <ellipse cx="${(fx + fw * 0.5).toFixed(2)}" cy="${(fy + fh * 0.76).toFixed(2)}" rx="${(fw * 0.24).toFixed(2)}" ry="${(fh * 0.14).toFixed(2)}" fill="url(#jawShadow)" filter="url(#softBlur)" />
      <ellipse cx="${(fx + fw * 0.5).toFixed(2)}" cy="${(fy + fh * 0.68).toFixed(2)}" rx="${(fw * 0.18).toFixed(2)}" ry="${(fh * 0.08).toFixed(2)}" fill="rgba(30,10,18,0.08)" filter="url(#softBlur)" />
    </svg>
  `;
}

function buildMoodMakeupSvg(width, height, variant) {
  const eyes = [config.anchors.leftEye, config.anchors.rightEye].map((eye) => ({
    x: eye.x * width,
    y: eye.y * height,
    w: eye.w * width,
    h: eye.h * height
  }));
  const tone = variant === "warm"
    ? { stroke: "rgba(166,42,68,0.34)", fill: "rgba(194,82,108,0.12)" }
    : variant === "concerned"
      ? { stroke: "rgba(72,32,40,0.34)", fill: "rgba(84,52,66,0.12)" }
      : variant === "teasing"
        ? { stroke: "rgba(134,26,64,0.36)", fill: "rgba(176,58,108,0.14)" }
      : { stroke: "rgba(184,94,130,0.3)", fill: "rgba(228,170,198,0.1)" };

  const groups = eyes.map((eye) => {
    const lift = variant === "surprised" ? -eye.h * 0.12 : variant === "teasing" ? -eye.h * 0.03 : 0;
    const wing = variant === "concerned" ? eye.w * 0.06 : variant === "teasing" ? eye.w * 0.14 : eye.w * 0.1;
    return `
      <path d="M ${(eye.x + eye.w * 0.06).toFixed(2)} ${(eye.y + eye.h * 0.3 + lift).toFixed(2)} Q ${(eye.x + eye.w * 0.48).toFixed(2)} ${(eye.y - eye.h * (variant === "teasing" ? 0.1 : 0.06) + lift).toFixed(2)} ${(eye.x + eye.w * 0.92 + wing).toFixed(2)} ${(eye.y + eye.h * 0.34 + lift).toFixed(2)}" stroke="${tone.stroke}" stroke-width="${Math.max(2, eye.h * 0.08).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
      <ellipse cx="${(eye.x + eye.w * 0.5).toFixed(2)}" cy="${(eye.y + eye.h * 0.1 + lift * 0.4).toFixed(2)}" rx="${(eye.w * 0.44).toFixed(2)}" ry="${(eye.h * 0.18).toFixed(2)}" fill="${tone.fill}" filter="url(#softBlur)" />
    `;
  }).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0018).toFixed(2)}" /></filter>
      </defs>
      ${groups}
    </svg>
  `;
}

function buildCheekShadowSvg(width, height, variant) {
  const face = config.anchors.face;
  const fx = face.x * width;
  const fy = face.y * height;
  const fw = face.w * width;
  const fh = face.h * height;
  const tone = variant === "warm"
    ? "rgba(190,86,102,0.16)"
    : variant === "teasing"
      ? "rgba(166,54,92,0.16)"
    : "rgba(80,54,64,0.16)";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0052).toFixed(2)}" /></filter>
      </defs>
      <ellipse cx="${(fx + fw * 0.28).toFixed(2)}" cy="${(fy + fh * 0.57).toFixed(2)}" rx="${(fw * 0.12).toFixed(2)}" ry="${(fh * 0.08).toFixed(2)}" fill="${tone}" filter="url(#softBlur)" />
      <ellipse cx="${(fx + fw * 0.72).toFixed(2)}" cy="${(fy + fh * 0.57).toFixed(2)}" rx="${(fw * 0.12).toFixed(2)}" ry="${(fh * 0.08).toFixed(2)}" fill="${tone}" filter="url(#softBlur)" />
    </svg>
  `;
}

function buildLayerMaskSvg(width, height, variant) {
  const face = config.anchors.face;
  const fx = face.x * width;
  const fy = face.y * height;
  const fw = face.w * width;
  const fh = face.h * height;
  const leftEye = config.anchors.leftEye;
  const rightEye = config.anchors.rightEye;
  const mouth = config.anchors.mouth;

  const layerBody = (() => {
    switch (variant) {
      case "faceCore":
        return `
          <ellipse cx="${(fx + fw * 0.5).toFixed(2)}" cy="${(fy + fh * 0.52).toFixed(2)}" rx="${(fw * 0.31).toFixed(2)}" ry="${(fh * 0.38).toFixed(2)}" fill="white" />
          <ellipse cx="${(fx + fw * 0.5).toFixed(2)}" cy="${(fy + fh * 0.28).toFixed(2)}" rx="${(fw * 0.22).toFixed(2)}" ry="${(fh * 0.12).toFixed(2)}" fill="white" />
        `;
      case "eyeCore":
        return `
          <ellipse cx="${((leftEye.x + leftEye.w * 0.5) * width).toFixed(2)}" cy="${((leftEye.y + leftEye.h * 0.38) * height).toFixed(2)}" rx="${(leftEye.w * width * 0.82).toFixed(2)}" ry="${(leftEye.h * height * 1.08).toFixed(2)}" fill="white" />
          <ellipse cx="${((rightEye.x + rightEye.w * 0.5) * width).toFixed(2)}" cy="${((rightEye.y + rightEye.h * 0.38) * height).toFixed(2)}" rx="${(rightEye.w * width * 0.82).toFixed(2)}" ry="${(rightEye.h * height * 1.08).toFixed(2)}" fill="white" />
          <ellipse cx="${((config.anchors.leftBrow.x + config.anchors.leftBrow.w * 0.5) * width).toFixed(2)}" cy="${((config.anchors.leftBrow.y + config.anchors.leftBrow.h * 0.5) * height).toFixed(2)}" rx="${(config.anchors.leftBrow.w * width * 0.56).toFixed(2)}" ry="${(config.anchors.leftBrow.h * height * 0.9).toFixed(2)}" fill="white" />
          <ellipse cx="${((config.anchors.rightBrow.x + config.anchors.rightBrow.w * 0.5) * width).toFixed(2)}" cy="${((config.anchors.rightBrow.y + config.anchors.rightBrow.h * 0.5) * height).toFixed(2)}" rx="${(config.anchors.rightBrow.w * width * 0.56).toFixed(2)}" ry="${(config.anchors.rightBrow.h * height * 0.9).toFixed(2)}" fill="white" />
        `;
      case "irisCore":
        return `
          <ellipse cx="${((leftEye.x + leftEye.w * 0.5) * width).toFixed(2)}" cy="${((leftEye.y + leftEye.h * 0.48) * height).toFixed(2)}" rx="${(leftEye.w * width * 0.34).toFixed(2)}" ry="${(leftEye.h * height * 0.58).toFixed(2)}" fill="white" />
          <ellipse cx="${((rightEye.x + rightEye.w * 0.5) * width).toFixed(2)}" cy="${((rightEye.y + rightEye.h * 0.48) * height).toFixed(2)}" rx="${(rightEye.w * width * 0.34).toFixed(2)}" ry="${(rightEye.h * height * 0.58).toFixed(2)}" fill="white" />
        `;
      case "lidSoft":
        return `
          <ellipse cx="${((leftEye.x + leftEye.w * 0.5) * width).toFixed(2)}" cy="${((leftEye.y + leftEye.h * 0.18) * height).toFixed(2)}" rx="${(leftEye.w * width * 0.76).toFixed(2)}" ry="${(leftEye.h * height * 0.74).toFixed(2)}" fill="white" />
          <ellipse cx="${((rightEye.x + rightEye.w * 0.5) * width).toFixed(2)}" cy="${((rightEye.y + rightEye.h * 0.18) * height).toFixed(2)}" rx="${(rightEye.w * width * 0.76).toFixed(2)}" ry="${(rightEye.h * height * 0.74).toFixed(2)}" fill="white" />
        `;
      case "mouthCore":
        return `
          <ellipse cx="${((mouth.x + mouth.w * 0.5) * width).toFixed(2)}" cy="${((mouth.y + mouth.h * 0.58) * height).toFixed(2)}" rx="${(mouth.w * width * 0.9).toFixed(2)}" ry="${(mouth.h * height * 1.15).toFixed(2)}" fill="white" />
        `;
      case "fringeVeil":
        return `
          <path d="M ${(fx + fw * 0.18).toFixed(2)} ${(fy + fh * 0.02).toFixed(2)} C ${(fx + fw * 0.26).toFixed(2)} ${(fy - fh * 0.1).toFixed(2)}, ${(fx + fw * 0.38).toFixed(2)} ${(fy - fh * 0.08).toFixed(2)}, ${(fx + fw * 0.42).toFixed(2)} ${(fy + fh * 0.08).toFixed(2)} C ${(fx + fw * 0.44).toFixed(2)} ${(fy + fh * 0.18).toFixed(2)}, ${(fx + fw * 0.38).toFixed(2)} ${(fy + fh * 0.26).toFixed(2)}, ${(fx + fw * 0.3).toFixed(2)} ${(fy + fh * 0.36).toFixed(2)}" fill="white" />
          <path d="M ${(fx + fw * 0.82).toFixed(2)} ${(fy + fh * 0.03).toFixed(2)} C ${(fx + fw * 0.74).toFixed(2)} ${(fy - fh * 0.1).toFixed(2)}, ${(fx + fw * 0.62).toFixed(2)} ${(fy - fh * 0.08).toFixed(2)}, ${(fx + fw * 0.58).toFixed(2)} ${(fy + fh * 0.08).toFixed(2)} C ${(fx + fw * 0.56).toFixed(2)} ${(fy + fh * 0.18).toFixed(2)}, ${(fx + fw * 0.62).toFixed(2)} ${(fy + fh * 0.26).toFixed(2)}, ${(fx + fw * 0.7).toFixed(2)} ${(fy + fh * 0.36).toFixed(2)}" fill="white" />
          <path d="M ${(fx + fw * 0.46).toFixed(2)} ${(fy - fh * 0.02).toFixed(2)} C ${(fx + fw * 0.5).toFixed(2)} ${(fy - fh * 0.08).toFixed(2)}, ${(fx + fw * 0.56).toFixed(2)} ${(fy - fh * 0.06).toFixed(2)}, ${(fx + fw * 0.56).toFixed(2)} ${(fy + fh * 0.04).toFixed(2)} C ${(fx + fw * 0.54).toFixed(2)} ${(fy + fh * 0.12).toFixed(2)}, ${(fx + fw * 0.48).toFixed(2)} ${(fy + fh * 0.14).toFixed(2)}, ${(fx + fw * 0.46).toFixed(2)} ${(fy - fh * 0.02).toFixed(2)}" fill="white" />
        `;
      default:
        return `
          <path d="M ${(fx + fw * 0.08).toFixed(2)} ${(fy + fh * 0.04).toFixed(2)} C ${(fx + fw * 0.1).toFixed(2)} ${(fy - fh * 0.16).toFixed(2)}, ${(fx + fw * 0.28).toFixed(2)} ${(fy - fh * 0.18).toFixed(2)}, ${(fx + fw * 0.36).toFixed(2)} ${(fy + fh * 0.05).toFixed(2)} C ${(fx + fw * 0.18).toFixed(2)} ${(fy + fh * 0.18).toFixed(2)}, ${(fx + fw * 0.14).toFixed(2)} ${(fy + fh * 0.33).toFixed(2)}, ${(fx + fw * 0.12).toFixed(2)} ${(fy + fh * 0.48).toFixed(2)}" fill="white" />
          <path d="M ${(fx + fw * 0.92).toFixed(2)} ${(fy + fh * 0.05).toFixed(2)} C ${(fx + fw * 0.9).toFixed(2)} ${(fy - fh * 0.16).toFixed(2)}, ${(fx + fw * 0.72).toFixed(2)} ${(fy - fh * 0.18).toFixed(2)}, ${(fx + fw * 0.64).toFixed(2)} ${(fy + fh * 0.05).toFixed(2)} C ${(fx + fw * 0.82).toFixed(2)} ${(fy + fh * 0.18).toFixed(2)}, ${(fx + fw * 0.86).toFixed(2)} ${(fy + fh * 0.33).toFixed(2)}, ${(fx + fw * 0.88).toFixed(2)} ${(fy + fh * 0.48).toFixed(2)}" fill="white" />
          <path d="M ${(fx + fw * 0.42).toFixed(2)} ${(fy - fh * 0.05).toFixed(2)} C ${(fx + fw * 0.46).toFixed(2)} ${(fy - fh * 0.13).toFixed(2)}, ${(fx + fw * 0.54).toFixed(2)} ${(fy - fh * 0.13).toFixed(2)}, ${(fx + fw * 0.58).toFixed(2)} ${(fy - fh * 0.05).toFixed(2)} C ${(fx + fw * 0.56).toFixed(2)} ${(fy + fh * 0.02).toFixed(2)}, ${(fx + fw * 0.44).toFixed(2)} ${(fy + fh * 0.02).toFixed(2)}, ${(fx + fw * 0.42).toFixed(2)} ${(fy - fh * 0.05).toFixed(2)}" fill="white" />
        `;
    }
  })();

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="black" />
      <g filter="url(#softBlur)">
        ${layerBody}
      </g>
      <defs>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0036).toFixed(2)}" /></filter>
      </defs>
    </svg>
  `;
}

function buildMouthSvg(width, height, variant) {
  const mouth = config.anchors.mouth;
  const x = mouth.x * width;
  const y = mouth.y * height;
  const w = mouth.w * width;
  const h = mouth.h * height;
  const cx = x + w * 0.5;
  const cy = y + h * 0.58;
  const presets = {
    soft: { open: 0.34, width: 0.22, roundness: 0.08, teeth: false },
    medium: { open: 0.48, width: 0.24, roundness: 0.14, teeth: true },
    wide: { open: 0.62, width: 0.28, roundness: 0.06, teeth: true },
    round: { open: 0.52, width: 0.17, roundness: 0.34, teeth: false }
  };
  const preset = presets[variant] || presets.soft;
  const open = preset.open;
  const innerW = w * preset.width;
  const innerH = h * (0.09 + open * (variant === "round" ? 0.4 : 0.34));
  const teeth = preset.teeth
    ? `<rect x="${(cx - innerW * 0.72).toFixed(2)}" y="${(cy - innerH * 0.78).toFixed(2)}" width="${(innerW * 1.44).toFixed(2)}" height="${(innerH * 0.28).toFixed(2)}" rx="${(innerH * 0.08).toFixed(2)}" fill="rgba(242,231,228,0.85)" filter="url(#softBlur)" />`
    : `<rect x="${(cx - innerW * 0.56).toFixed(2)}" y="${(cy - innerH * 0.62).toFixed(2)}" width="${(innerW * 1.12).toFixed(2)}" height="${(innerH * 0.16).toFixed(2)}" rx="${(innerH * 0.08).toFixed(2)}" fill="rgba(236,224,220,0.38)" filter="url(#softBlur)" />`;
  const upperCurveY = variant === "round" ? y + h * 0.4 : y + h * 0.34;
  const lowerCurveY = variant === "round" ? y + h * 0.78 : y + h * (0.84 + open * 0.03);
  const lowerStartY = variant === "round" ? y + h * 0.61 : y + h * (0.54 + open * 0.04);
  const glossOpacity = variant === "round" ? 0.26 : 0.42;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="mouthShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(26,8,12,0.95)" />
          <stop offset="60%" stop-color="rgba(74,18,30,0.88)" />
          <stop offset="100%" stop-color="rgba(148,56,74,0.46)" />
        </linearGradient>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.002).toFixed(2)}" /></filter>
      </defs>
      <ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${innerW.toFixed(2)}" ry="${innerH.toFixed(2)}" fill="url(#mouthShade)" filter="url(#softBlur)" />
      ${teeth}
      <path d="M ${(x + w * 0.18).toFixed(2)} ${lowerStartY.toFixed(2)} Q ${cx.toFixed(2)} ${lowerCurveY.toFixed(2)} ${(x + w * 0.82).toFixed(2)} ${lowerStartY.toFixed(2)}" stroke="rgba(137,22,44,0.94)" stroke-width="${Math.max(2, h * 0.06).toFixed(2)}" fill="none" stroke-linecap="round" />
      <path d="M ${(x + w * (0.2 + preset.roundness * 0.05)).toFixed(2)} ${(y + h * 0.48).toFixed(2)} Q ${cx.toFixed(2)} ${upperCurveY.toFixed(2)} ${(x + w * (0.8 - preset.roundness * 0.05)).toFixed(2)} ${(y + h * 0.48).toFixed(2)}" stroke="rgba(120,24,42,${glossOpacity})" stroke-width="${Math.max(1.6, h * 0.04).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
    </svg>
  `;
}

function buildConsonantMouthSvg(width, height, variant) {
  const mouth = config.anchors.mouth;
  const x = mouth.x * width;
  const y = mouth.y * height;
  const w = mouth.w * width;
  const h = mouth.h * height;
  const cx = x + w * 0.5;
  const lipY = y + h * 0.61;

  if (variant === "closedPress") {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0018).toFixed(2)}" /></filter>
        </defs>
        <path d="M ${(x + w * 0.18).toFixed(2)} ${(y + h * 0.58).toFixed(2)} Q ${cx.toFixed(2)} ${(y + h * 0.49).toFixed(2)} ${(x + w * 0.82).toFixed(2)} ${(y + h * 0.58).toFixed(2)}" stroke="rgba(92,18,34,0.74)" stroke-width="${Math.max(2.2, h * 0.1).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
        <path d="M ${(x + w * 0.2).toFixed(2)} ${lipY.toFixed(2)} Q ${cx.toFixed(2)} ${(y + h * 0.66).toFixed(2)} ${(x + w * 0.8).toFixed(2)} ${lipY.toFixed(2)}" stroke="rgba(148,34,58,0.76)" stroke-width="${Math.max(2.6, h * 0.12).toFixed(2)}" fill="none" stroke-linecap="round" />
        <ellipse cx="${cx.toFixed(2)}" cy="${(y + h * 0.61).toFixed(2)}" rx="${(w * 0.22).toFixed(2)}" ry="${(h * 0.07).toFixed(2)}" fill="rgba(205,104,120,0.12)" filter="url(#softBlur)" />
      </svg>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="biteShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(236,222,218,0.9)" />
          <stop offset="100%" stop-color="rgba(198,160,156,0.44)" />
        </linearGradient>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0017).toFixed(2)}" /></filter>
      </defs>
      <path d="M ${(x + w * 0.22).toFixed(2)} ${(y + h * 0.53).toFixed(2)} Q ${cx.toFixed(2)} ${(y + h * 0.41).toFixed(2)} ${(x + w * 0.78).toFixed(2)} ${(y + h * 0.53).toFixed(2)}" stroke="rgba(132,28,46,0.7)" stroke-width="${Math.max(2, h * 0.08).toFixed(2)}" fill="none" stroke-linecap="round" />
      <path d="M ${(x + w * 0.26).toFixed(2)} ${(y + h * 0.59).toFixed(2)} Q ${cx.toFixed(2)} ${(y + h * 0.76).toFixed(2)} ${(x + w * 0.74).toFixed(2)} ${(y + h * 0.62).toFixed(2)}" stroke="rgba(156,42,66,0.84)" stroke-width="${Math.max(2.4, h * 0.11).toFixed(2)}" fill="none" stroke-linecap="round" />
      <rect x="${(cx - w * 0.13).toFixed(2)}" y="${(y + h * 0.47).toFixed(2)}" width="${(w * 0.26).toFixed(2)}" height="${(h * 0.09).toFixed(2)}" rx="${(h * 0.03).toFixed(2)}" fill="url(#biteShade)" filter="url(#softBlur)" />
      <ellipse cx="${(cx + w * 0.01).toFixed(2)}" cy="${(y + h * 0.61).toFixed(2)}" rx="${(w * 0.17).toFixed(2)}" ry="${(h * 0.08).toFixed(2)}" fill="rgba(72,12,22,0.16)" filter="url(#softBlur)" />
    </svg>
  `;
}

function buildPhonemeMouthSvg(width, height, variant) {
  const mouth = config.anchors.mouth;
  const x = mouth.x * width;
  const y = mouth.y * height;
  const w = mouth.w * width;
  const h = mouth.h * height;
  const cx = x + w * 0.5;
  const cy = y + h * 0.58;

  const presets = {
    ee: {
      rx: w * 0.26,
      ry: h * 0.12,
      topY: y + h * 0.44,
      bottomY: y + h * 0.62,
      teeth: { w: w * 0.52, h: h * 0.12, y: y + h * 0.47 },
      gloss: 0.38
    },
    ah: {
      rx: w * 0.22,
      ry: h * 0.28,
      topY: y + h * 0.34,
      bottomY: y + h * 0.84,
      teeth: { w: w * 0.42, h: h * 0.14, y: y + h * 0.42 },
      gloss: 0.3
    },
    oh: {
      rx: w * 0.17,
      ry: h * 0.25,
      topY: y + h * 0.36,
      bottomY: y + h * 0.78,
      teeth: { w: w * 0.28, h: h * 0.08, y: y + h * 0.45 },
      gloss: 0.24
    },
    sibilant: {
      rx: w * 0.24,
      ry: h * 0.1,
      topY: y + h * 0.46,
      bottomY: y + h * 0.63,
      teeth: { w: w * 0.54, h: h * 0.11, y: y + h * 0.49 },
      gloss: 0.22
    },
    tongue: {
      rx: w * 0.19,
      ry: h * 0.18,
      topY: y + h * 0.42,
      bottomY: y + h * 0.72,
      teeth: { w: w * 0.34, h: h * 0.08, y: y + h * 0.44 },
      gloss: 0.22
    }
  };

  const preset = presets[variant];
  const teeth = preset.teeth
    ? `<rect x="${(cx - preset.teeth.w * 0.5).toFixed(2)}" y="${preset.teeth.y.toFixed(2)}" width="${preset.teeth.w.toFixed(2)}" height="${preset.teeth.h.toFixed(2)}" rx="${(preset.teeth.h * 0.24).toFixed(2)}" fill="rgba(242,231,228,0.84)" filter="url(#softBlur)" />`
    : "";
  const tongue = variant === "tongue"
    ? `<ellipse cx="${cx.toFixed(2)}" cy="${(cy + h * 0.05).toFixed(2)}" rx="${(w * 0.11).toFixed(2)}" ry="${(h * 0.08).toFixed(2)}" fill="rgba(178,66,88,0.56)" filter="url(#softBlur)" />`
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="mouthShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(24,8,11,0.95)" />
          <stop offset="60%" stop-color="rgba(74,18,30,0.88)" />
          <stop offset="100%" stop-color="rgba(148,56,74,0.46)" />
        </linearGradient>
        <filter id="softBlur"><feGaussianBlur stdDeviation="${(width * 0.0018).toFixed(2)}" /></filter>
      </defs>
      <ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${preset.rx.toFixed(2)}" ry="${preset.ry.toFixed(2)}" fill="url(#mouthShade)" filter="url(#softBlur)" />
      ${teeth}
      ${tongue}
      <path d="M ${(x + w * 0.18).toFixed(2)} ${(y + h * 0.54).toFixed(2)} Q ${cx.toFixed(2)} ${preset.bottomY.toFixed(2)} ${(x + w * 0.82).toFixed(2)} ${(y + h * 0.54).toFixed(2)}" stroke="rgba(140,28,48,0.92)" stroke-width="${Math.max(2, h * 0.07).toFixed(2)}" fill="none" stroke-linecap="round" />
      <path d="M ${(x + w * 0.2).toFixed(2)} ${(y + h * 0.46).toFixed(2)} Q ${cx.toFixed(2)} ${preset.topY.toFixed(2)} ${(x + w * 0.8).toFixed(2)} ${(y + h * 0.46).toFixed(2)}" stroke="rgba(118,24,40,${preset.gloss})" stroke-width="${Math.max(1.5, h * 0.04).toFixed(2)}" fill="none" stroke-linecap="round" filter="url(#softBlur)" />
    </svg>
  `;
}

async function writeVariantPlates() {
  const meta = await sharp(outputFile).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Could not read portrait dimensions");
  }
  const width = meta.width;
  const height = meta.height;
  const variants = [
    { file: path.join(outDir, "blink.png"), svg: buildBlinkSvg(width, height) },
    { file: path.join(outDir, "brow-lift.png"), svg: buildBrowSvg(width, height, "lift") },
    { file: path.join(outDir, "brow-knit.png"), svg: buildBrowSvg(width, height, "knit") },
    { file: path.join(outDir, "front-hair.png"), svg: buildFrontHairSvg(width, height) },
    { file: path.join(outDir, "eye-gloss.png"), svg: buildEyeGlossSvg(width, height) },
    { file: path.join(outDir, "jaw-shadow.png"), svg: buildJawShadowSvg(width, height) },
    { file: path.join(outDir, "makeup-warm.png"), svg: buildMoodMakeupSvg(width, height, "warm") },
    { file: path.join(outDir, "makeup-concerned.png"), svg: buildMoodMakeupSvg(width, height, "concerned") },
    { file: path.join(outDir, "makeup-surprised.png"), svg: buildMoodMakeupSvg(width, height, "surprised") },
    { file: path.join(outDir, "makeup-teasing.png"), svg: buildMoodMakeupSvg(width, height, "teasing") },
    { file: path.join(outDir, "cheek-warm.png"), svg: buildCheekShadowSvg(width, height, "warm") },
    { file: path.join(outDir, "cheek-concerned.png"), svg: buildCheekShadowSvg(width, height, "concerned") },
    { file: path.join(outDir, "cheek-teasing.png"), svg: buildCheekShadowSvg(width, height, "teasing") },
    { file: path.join(outDir, "mouth-open-soft.png"), svg: buildMouthSvg(width, height, "soft") },
    { file: path.join(outDir, "mouth-open-medium.png"), svg: buildMouthSvg(width, height, "medium") },
    { file: path.join(outDir, "mouth-open-wide.png"), svg: buildMouthSvg(width, height, "wide") },
    { file: path.join(outDir, "mouth-round.png"), svg: buildMouthSvg(width, height, "round") },
    { file: path.join(outDir, "mouth-closed-press.png"), svg: buildConsonantMouthSvg(width, height, "closedPress") },
    { file: path.join(outDir, "mouth-lip-bite.png"), svg: buildConsonantMouthSvg(width, height, "lipBite") },
    { file: path.join(outDir, "mouth-ee.png"), svg: buildPhonemeMouthSvg(width, height, "ee") },
    { file: path.join(outDir, "mouth-ah.png"), svg: buildPhonemeMouthSvg(width, height, "ah") },
    { file: path.join(outDir, "mouth-oh.png"), svg: buildPhonemeMouthSvg(width, height, "oh") },
    { file: path.join(outDir, "mouth-sibilant.png"), svg: buildPhonemeMouthSvg(width, height, "sibilant") },
    { file: path.join(outDir, "mouth-tongue.png"), svg: buildPhonemeMouthSvg(width, height, "tongue") }
  ];

  for (const variant of variants) {
    await sharp(outputFile)
      .composite([{ input: Buffer.from(variant.svg, "utf8"), blend: "over" }])
      .png()
      .toFile(variant.file);
  }

  const layerVariants = [
    { file: path.join(outDir, "layer-face-core.png"), mask: buildLayerMaskSvg(width, height, "faceCore") },
    { file: path.join(outDir, "layer-eye-core.png"), mask: buildLayerMaskSvg(width, height, "eyeCore") },
    { file: path.join(outDir, "layer-iris-core.png"), mask: buildLayerMaskSvg(width, height, "irisCore") },
    { file: path.join(outDir, "layer-lid-soft.png"), mask: buildLayerMaskSvg(width, height, "lidSoft") },
    { file: path.join(outDir, "layer-mouth-core.png"), mask: buildLayerMaskSvg(width, height, "mouthCore") },
    { file: path.join(outDir, "layer-hair-shell.png"), mask: buildLayerMaskSvg(width, height, "hairShell") },
    { file: path.join(outDir, "layer-fringe-veil.png"), mask: buildLayerMaskSvg(width, height, "fringeVeil") }
  ];

  for (const layer of layerVariants) {
    await sharp(outputFile)
      .ensureAlpha()
      .composite([{ input: Buffer.from(layer.mask, "utf8"), blend: "dest-in" }])
      .png()
      .toFile(layer.file);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(promptFile, `${prompt}\n`, "utf8");
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  if (!variantsOnly) {
    if (!process.env.OPENAI_API_KEY) {
      if (!fs.existsSync(outputFile)) {
        throw new Error("OPENAI_API_KEY is required unless base.png already exists");
      }
    } else {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 10 * 60 * 1000
      });

      const response = await client.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1536",
        quality: "high",
        output_format: "png",
        moderation: "low"
      });

      const image = response.data?.[0];
      if (!image?.b64_json) {
        throw new Error("No image returned");
      }

      fs.writeFileSync(outputFile, Buffer.from(image.b64_json, "base64"));
    }
  }

  if (!fs.existsSync(outputFile)) {
    throw new Error("base.png is missing");
  }

  await writeVariantPlates();
  console.log(outputFile);
  console.log(configFile);
  console.log(path.join(outDir, "blink.png"));
  console.log(path.join(outDir, "brow-lift.png"));
  console.log(path.join(outDir, "brow-knit.png"));
  console.log(path.join(outDir, "front-hair.png"));
  console.log(path.join(outDir, "eye-gloss.png"));
  console.log(path.join(outDir, "jaw-shadow.png"));
  console.log(path.join(outDir, "makeup-warm.png"));
  console.log(path.join(outDir, "makeup-concerned.png"));
  console.log(path.join(outDir, "makeup-surprised.png"));
  console.log(path.join(outDir, "makeup-teasing.png"));
  console.log(path.join(outDir, "cheek-warm.png"));
  console.log(path.join(outDir, "cheek-concerned.png"));
  console.log(path.join(outDir, "cheek-teasing.png"));
  console.log(path.join(outDir, "layer-face-core.png"));
  console.log(path.join(outDir, "layer-eye-core.png"));
  console.log(path.join(outDir, "layer-iris-core.png"));
  console.log(path.join(outDir, "layer-lid-soft.png"));
  console.log(path.join(outDir, "layer-mouth-core.png"));
  console.log(path.join(outDir, "layer-hair-shell.png"));
  console.log(path.join(outDir, "layer-fringe-veil.png"));
  console.log(path.join(outDir, "mouth-open-soft.png"));
  console.log(path.join(outDir, "mouth-open-medium.png"));
  console.log(path.join(outDir, "mouth-open-wide.png"));
  console.log(path.join(outDir, "mouth-round.png"));
  console.log(path.join(outDir, "mouth-closed-press.png"));
  console.log(path.join(outDir, "mouth-lip-bite.png"));
  console.log(path.join(outDir, "mouth-ee.png"));
  console.log(path.join(outDir, "mouth-ah.png"));
  console.log(path.join(outDir, "mouth-oh.png"));
  console.log(path.join(outDir, "mouth-sibilant.png"));
  console.log(path.join(outDir, "mouth-tongue.png"));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
