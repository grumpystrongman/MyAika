"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  blendLenoreConversationPose,
  computeLenoreConversationPose,
  getLenoreTransitionAlpha
} from "../avatar/lenoreConversationStates.js";
import {
  composeLenoreFaceTargets,
  getLipsyncTargetsAtElapsed
} from "../avatar/lenoreFacialPerformance.js";

THREE.Cache.enabled = true;

const DEFAULT_APPEARANCE = {
  cameraFrame: "bust",
  hairColor: "#0a080c",
  skinColor: "#efd5dd",
  lipColor: "#4d091d",
  outfitColor: "#120b14",
  accentColor: "#2c1627",
  eyeGlow: 0.5,
  matte: 0.94,
  showHostessGown: false,
  showHair: true,
  showJacket: true,
  showWrap: true,
  showGloves: true,
  showTop: true,
  showBottoms: true,
  showStockings: true,
  showBoots: true,
  showChoker: true,
  showPiercing: true
};

const DEFAULT_MOTION = {
  playClip: false,
  clipName: "runtime_pose",
  clipSpeed: 0.75,
  clipWeight: 0,
  idleHead: 0.28,
  talkHead: 0.16,
  bodySway: 0.1,
  choreographyPreset: "quiet_poise",
  empathyMode: "steady",
  responseClass: "neutral",
  motionIntensity: 0.45,
  idleState: "paused"
};

const SAFE_FRAME_SET = new Set(["portrait", "bust"]);
const SAFE_HEAD_TARGETS = new Set([
  "Eye_Blink_Left",
  "Eye_Blink_Right",
  "Eye_Blink_L",
  "Eye_Blink_R",
  "Eye_Close_L",
  "Eye_Close_R",
  "Eye_Squint_Left",
  "Eye_Squint_Right",
  "Brow_Raise_Outer_Left",
  "Brow_Raise_Outer_Right",
  "Brow_Raise_Inner_Left",
  "Brow_Raise_Inner_Right",
  "Brow_Drop_Left",
  "Brow_Drop_Right",
  "Cheek_Raise_L",
  "Cheek_Raise_R",
  "Mouth_Open",
  "Mouth_Lips_Part",
  "Mouth_Lips_Tight",
  "Mouth_Pucker",
  "Mouth_Pucker_Open",
  "Mouth_Widen",
  "Mouth_Smile",
  "Mouth_Frown",
  "Mouth_Bottom_Lip_Bite",
  "Mouth_Top_Lip_Up"
]);
const SAFE_BROW_TARGETS = new Set([
  "Eye_Blink_Left",
  "Eye_Blink_Right",
  "Eye_Blink_L",
  "Eye_Blink_R",
  "Eye_Close_L",
  "Eye_Close_R",
  "Eye_Squint_Left",
  "Eye_Squint_Right",
  "Brow_Raise_Outer_Left",
  "Brow_Raise_Outer_Right",
  "Brow_Raise_Inner_Left",
  "Brow_Raise_Inner_Right",
  "Brow_Drop_Left",
  "Brow_Drop_Right",
  "Cheek_Raise_L",
  "Cheek_Raise_R"
]);
const SAFE_TONGUE_TARGETS = new Set(["V_Tongue_Out", "V_Tongue_up"]);

const SUPPORTED_PRESETS = new Set(["formal_dark", "stage_entrance", "goth_hostess"]);
const SUPPORTED_CHOREOGRAPHY_PRESETS = new Set(["auto", "quiet_poise", "command_presence", "soft_reassure"]);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAppearance(input) {
  const next = { ...DEFAULT_APPEARANCE, ...(input || {}) };
  const preset = String(next.preset || "formal_dark").trim().toLowerCase();
  const frame = String(next.cameraFrame || DEFAULT_APPEARANCE.cameraFrame).toLowerCase();
  next.preset = SUPPORTED_PRESETS.has(preset) ? preset : "formal_dark";
  next.cameraFrame = SAFE_FRAME_SET.has(frame) ? frame : DEFAULT_APPEARANCE.cameraFrame;
  next.eyeGlow = clamp(Number(next.eyeGlow ?? DEFAULT_APPEARANCE.eyeGlow), 0, 1);
  next.matte = clamp(Number(next.matte ?? DEFAULT_APPEARANCE.matte), 0.4, 1);
  next.showHostessGown = false;
  // The purchased Lenore conversation runtime has an exposed left upper-arm seam when the jacket is hidden.
  // Clamp unstable reveal combinations until the asset is repaired.
  next.showJacket = true;
  next.showTop = true;
  next.showBottoms = true;
  next.showGloves = next.showGloves !== false;
  next.showStockings = next.showStockings !== false;
  next.showBoots = next.showBoots !== false;
  return next;
}

function normalizeMotion(input) {
  const next = { ...DEFAULT_MOTION, ...(input || {}) };
  const choreographyPreset = String(next.choreographyPreset || DEFAULT_MOTION.choreographyPreset).trim().toLowerCase();
  next.clipName = "runtime_pose";
  next.clipSpeed = clamp(Number(next.clipSpeed ?? DEFAULT_MOTION.clipSpeed), 0.5, 1.2);
  next.clipWeight = 0;
  next.idleHead = clamp(Number(next.idleHead ?? DEFAULT_MOTION.idleHead), 0, 1);
  next.talkHead = clamp(Number(next.talkHead ?? DEFAULT_MOTION.talkHead), 0, 1);
  next.bodySway = clamp(Number(next.bodySway ?? DEFAULT_MOTION.bodySway), 0, 1);
  next.choreographyPreset = SUPPORTED_CHOREOGRAPHY_PRESETS.has(choreographyPreset) ? choreographyPreset : DEFAULT_MOTION.choreographyPreset;
  next.empathyMode = String(next.empathyMode || DEFAULT_MOTION.empathyMode).trim().toLowerCase() || DEFAULT_MOTION.empathyMode;
  next.motionIntensity = clamp(Number(next.motionIntensity ?? DEFAULT_MOTION.motionIntensity), 0, 1.5);
  next.responseClass = String(next.responseClass || DEFAULT_MOTION.responseClass).trim().toLowerCase() || DEFAULT_MOTION.responseClass;
  next.idleState = String(next.idleState || DEFAULT_MOTION.idleState).trim().toLowerCase() || DEFAULT_MOTION.idleState;
  next.playClip = false;
  return next;
}

function resolvePreferredClipName(animations = [], runtime) {
  return "";
}

function resolveMotionState(animations = [], runtime) {
  const clipKind = "authored_state";
  const selectedClipName = "";
  let clipSpeed = 0;
  let clipWeight = 0;
  let idleHead = runtime.motion.idleHead;
  let talkHead = runtime.motion.talkHead;
  let bodySway = runtime.motion.bodySway;
  const choreographyPreset = String(runtime.motion.choreographyPreset || "auto").toLowerCase();
  const responseClass = String(runtime.motion.responseClass || "neutral");
  const motionIntensity = clamp(Number(runtime.motion.motionIntensity ?? 0.45), 0, 1.5);

  idleHead *= runtime.isListening ? 1.12 : 1;
  talkHead *= runtime.isTalking ? 1.16 : 0.88;
  bodySway *= runtime.isTalking ? 0.72 : 1;

  if (responseClass === "teasing") {
    clipSpeed *= 1.05;
    clipWeight *= 1;
    idleHead *= 1.08;
    talkHead *= 1.22;
    bodySway *= 1.2;
  } else if (responseClass === "playful" || responseClass === "surprised") {
    clipSpeed *= 1.08;
    talkHead *= 1.14;
    bodySway *= 1.1;
  } else if (responseClass === "directive" || responseClass === "executive") {
    clipSpeed *= 0.94;
    clipWeight *= 1;
    idleHead *= 0.88;
    talkHead *= 0.92;
    bodySway *= 0.82;
  } else if (responseClass === "reflective" || responseClass === "comfort" || responseClass === "question") {
    clipSpeed *= 0.92;
    clipWeight *= 0.95;
    idleHead *= 1.05;
    talkHead *= 0.9;
    bodySway *= 0.9;
  }

  if (choreographyPreset === "velvet_tease") {
    clipSpeed *= 1.04;
    idleHead *= 1.08;
    talkHead *= 1.18;
    bodySway *= 1.16;
  } else if (choreographyPreset === "command_presence") {
    clipSpeed *= 0.94;
    idleHead *= 0.82;
    talkHead *= 0.88;
    bodySway *= 0.76;
  } else if (choreographyPreset === "soft_reassure") {
    clipSpeed *= 0.9;
    clipWeight *= 0.94;
    idleHead *= 1.06;
    talkHead *= 0.92;
    bodySway *= 0.84;
  } else if (choreographyPreset === "quiet_poise") {
    clipSpeed *= 0.88;
    clipWeight *= 0.96;
    idleHead *= 0.72;
    talkHead *= 0.78;
    bodySway *= 0.62;
  }

  clipSpeed *= 0.9 + motionIntensity * 0.22;
  talkHead *= 0.88 + motionIntensity * 0.2;
  bodySway *= 0.86 + motionIntensity * 0.24;

  return {
    clipKind,
    selectedClipName,
    clipSpeed: clamp(clipSpeed, 0, 2),
    clipWeight: clamp(clipWeight, 0, 1),
    idleHead: clamp(idleHead, 0, 1),
    talkHead: clamp(talkHead, 0, 1),
    bodySway: clamp(bodySway, 0, 1)
  };
}

function applyMorphTargets(dict, influences, targets = {}, mode = "max") {
  for (const [name, value] of Object.entries(targets || {})) {
    const index = dict?.[name];
    if (index == null) continue;
    const nextValue = clamp(Number(value) || 0, 0, 1);
    influences[index] = mode === "set"
      ? nextValue
      : Math.max(influences[index] || 0, nextValue);
  }
}

function filterTargetsByPrefix(targets = {}, prefixes = []) {
  const next = {};
  for (const [key, value] of Object.entries(targets || {})) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) next[key] = value;
  }
  return next;
}

function filterTargetsToAllowedSet(targets = {}, allowed = new Set()) {
  const next = {};
  for (const [key, value] of Object.entries(targets || {})) {
    if (!allowed.has(key)) continue;
    next[key] = Number(value) || 0;
  }
  return next;
}

function scaleTargetMap(targets = {}, scale = 1) {
  const next = {};
  for (const [key, value] of Object.entries(targets || {})) {
    next[key] = (Number(value) || 0) * scale;
  }
  return next;
}

function categorizeMorphMesh(node) {
  const meshName = String(node?.name || "");
  const materialNames = (Array.isArray(node?.material) ? node.material : [node?.material])
    .map((material) => String(material?.name || ""));
  const label = `${meshName} ${materialNames.join(" ")}`.toLowerCase();
  if (meshName === "CC_Base_Tongue") return "tongue";
  if (meshName === "Eyebrow") return "brow";
  if (meshName === "CC_Base_Body_6" || label.includes("std_eyelash")) return "lash";
  if (meshName === "CC_Base_Body_1" || label.includes("std_skin_head")) return "head";
  return null;
}

function boneMatches(node, names) {
  const name = String(node?.name || "").toLowerCase();
  return names.some((candidate) => name === String(candidate).toLowerCase());
}

function isFbxModelUrl(modelUrl = "") {
  return /\.fbx($|\?)/i.test(String(modelUrl || ""));
}

function getFrameConfig(frame, size) {
  const configs = {
    portrait: {
      height: size.y * 0.22,
      headroom: size.y * 0.07,
      width: size.x * 0.18,
      minDistance: 1.1
    },
    bust: {
      height: size.y * 0.3,
      headroom: size.y * 0.065,
      width: size.x * 0.22,
      minDistance: 1.22
    },
    waist: {
      height: size.y * 0.5,
      headroom: size.y * 0.04,
      width: size.x * 0.3,
      minDistance: 1.48
    },
    three_quarter: {
      height: size.y * 0.82,
      headroom: size.y * 0.04,
      width: size.x * 0.46,
      minDistance: 1.92
    },
    full: {
      height: size.y * 1.08,
      headroom: size.y * 0.03,
      width: size.x * 0.66,
      minDistance: 2.45
    }
  };
  return configs[frame] || configs.bust;
}

function applyCameraFrame(camera, bounds, frame) {
  if (!camera || !bounds?.size || !bounds?.center || !bounds?.box) return;
  const { size, center, box } = bounds;
  const frameConfig = getFrameConfig(frame, size);
  const maxY = box.max.y;
  const minY = box.min.y;
  const targetHeight = frameConfig.height;
  const headroom = frameConfig.headroom;
  const targetTop = maxY + headroom;
  const targetBottom = frame === "full" ? minY - size.y * 0.03 : targetTop - targetHeight;
  const focusY = (targetTop + targetBottom) / 2;
  const fovRadians = THREE.MathUtils.degToRad(camera.fov);
  const fitDistanceY = ((targetTop - targetBottom) / 2) / Math.tan(fovRadians / 2);
  const horizontalTan = Math.tan((fovRadians * camera.aspect) / 2);
  const widthForFit = frameConfig.width;
  const fitDistanceX = widthForFit / Math.max(horizontalTan, 0.1);
  const distance = Math.max(fitDistanceY, fitDistanceX, frameConfig.minDistance);
  camera.position.set(center.x, focusY, center.z + distance);
  camera.lookAt(center.x, focusY, center.z);
  camera.updateProjectionMatrix();
}

function normalizeSceneTransform(root, isFbx) {
  if (isFbx) {
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
  }

  let box = new THREE.Box3().setFromObject(root);
  let size = box.getSize(new THREE.Vector3());
  let center = box.getCenter(new THREE.Vector3());

  if (isFbx && size.y > 10) {
    const targetHeight = 2.05;
    const scaleFactor = targetHeight / size.y;
    root.scale.multiplyScalar(scaleFactor);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    size = box.getSize(new THREE.Vector3());
    center = box.getCenter(new THREE.Vector3());
  }

  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(root);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  return { box, size, center };
}

function buildHostessAttire(bounds, appearance) {
  const { box, size, center } = bounds;
  const group = new THREE.Group();
  group.name = "LenoreHostessAttire";
  group.position.set(center.x, 0, center.z);

  const outfitMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.outfitColor),
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.accentColor),
    roughness: 0.62,
    metalness: 0.14,
    side: THREE.DoubleSide
  });

  const shoulderRadius = Math.max(size.x * 0.16, 0.2);
  const bodiceTopRadius = Math.max(size.x * 0.18, 0.22);
  const bodiceBottomRadius = Math.max(size.x * 0.14, 0.17);
  const hemRadius = Math.max(size.x * 0.26, 0.34);
  const shoulderBandHeight = Math.max(size.y * 0.075, 0.12);
  const bodiceHeight = Math.max(size.y * 0.24, 0.38);
  const skirtHeight = Math.max(size.y * 0.52, 0.98);
  const shouldersY = box.max.y - size.y * 0.23;
  const bodiceY = shouldersY - bodiceHeight * 0.52;
  const skirtY = bodiceY - bodiceHeight * 0.48 - skirtHeight * 0.48 + 0.02;

  const shoulderBand = new THREE.Mesh(
    new THREE.CylinderGeometry(shoulderRadius * 1.04, shoulderRadius * 1.08, shoulderBandHeight, 28, 1, true),
    outfitMaterial
  );
  shoulderBand.position.set(0, shouldersY, 0);

  const bodice = new THREE.Mesh(
    new THREE.CylinderGeometry(bodiceTopRadius, bodiceBottomRadius, bodiceHeight, 30, 1, true),
    outfitMaterial
  );
  bodice.position.set(0, bodiceY, 0);

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(bodiceBottomRadius * 1.02, hemRadius, skirtHeight, 32, 1, true),
    outfitMaterial
  );
  skirt.position.set(0, skirtY, 0);

  const neckline = new THREE.Mesh(
    new THREE.TorusGeometry(shoulderRadius * 0.96, 0.016, 12, 44),
    accentMaterial
  );
  neckline.rotation.x = Math.PI / 2;
  neckline.position.set(0, shouldersY + shoulderBandHeight * 0.02, 0.006);

  const waistBand = new THREE.Mesh(
    new THREE.TorusGeometry(bodiceBottomRadius * 1.03, 0.016, 10, 40),
    accentMaterial
  );
  waistBand.rotation.x = Math.PI / 2;
  waistBand.position.set(0, bodiceY - bodiceHeight * 0.44, 0);

  const sleeveUpperL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.066, 1, 18, 1, true), outfitMaterial);
  const sleeveLowerL = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 1, 18, 1, true), outfitMaterial);
  const sleeveUpperR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.066, 1, 18, 1, true), outfitMaterial);
  const sleeveLowerR = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 1, 18, 1, true), outfitMaterial);

  for (const mesh of [shoulderBand, bodice, skirt, neckline, waistBand, sleeveUpperL, sleeveLowerL, sleeveUpperR, sleeveLowerR]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    if (mesh.material && "polygonOffset" in mesh.material) {
      mesh.material.polygonOffset = true;
      mesh.material.polygonOffsetFactor = -2;
      mesh.material.polygonOffsetUnits = -2;
    }
    group.add(mesh);
  }

  group.visible = appearance.showHostessGown !== false;
  return {
    group,
    materials: { outfitMaterial, accentMaterial },
    meshes: { shoulderBand, bodice, skirt, neckline, waistBand, sleeveUpperL, sleeveLowerL, sleeveUpperR, sleeveLowerR }
  };
}

function alignCylinderToPoints(mesh, start, end, radiusScale = 1) {
  if (!mesh || !start || !end) return;
  const vec = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(vec.length(), 0.001);
  mesh.position.copy(start).addScaledVector(vec, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
  mesh.scale.set(radiusScale, length, radiusScale);
}

function updateHostessAttire(attire, appearance, bones, root) {
  if (!attire?.group) return;
  attire.group.visible = appearance.showHostessGown !== false;
  const frame = String(appearance.cameraFrame || "bust").toLowerCase();
  const showSkirt = !["portrait", "bust"].includes(frame);
  const showWaistBand = frame !== "portrait";
  if (attire.meshes?.waistBand) attire.meshes.waistBand.visible = attire.group.visible && showWaistBand;
  if (attire.meshes?.shoulderBand) attire.meshes.shoulderBand.visible = attire.group.visible;
  if (attire.meshes?.bodice) attire.meshes.bodice.visible = attire.group.visible;
  if (attire.meshes?.skirt) attire.meshes.skirt.visible = attire.group.visible && showSkirt;
  if (attire.meshes?.neckline) attire.meshes.neckline.visible = attire.group.visible;
  const showSleeves = attire.group.visible;
  if (attire.meshes?.sleeveUpperL) attire.meshes.sleeveUpperL.visible = showSleeves;
  if (attire.meshes?.sleeveLowerL) attire.meshes.sleeveLowerL.visible = showSleeves;
  if (attire.meshes?.sleeveUpperR) attire.meshes.sleeveUpperR.visible = showSleeves;
  if (attire.meshes?.sleeveLowerR) attire.meshes.sleeveLowerR.visible = showSleeves;
  attire.materials?.outfitMaterial?.color?.set?.(appearance.outfitColor);
  attire.materials?.accentMaterial?.color?.set?.(appearance.accentColor);
  if (attire.materials?.outfitMaterial) {
    attire.materials.outfitMaterial.roughness = 0.84 + appearance.matte * 0.12;
    attire.materials.outfitMaterial.needsUpdate = true;
  }
  if (attire.materials?.accentMaterial) {
    attire.materials.accentMaterial.roughness = 0.48 + appearance.matte * 0.12;
    attire.materials.accentMaterial.needsUpdate = true;
  }
  if (!showSleeves || !root) return;
  const toLocal = (bone) => {
    if (!bone?.getWorldPosition) return null;
    return root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  };
  const leftArm = toLocal(bones?.leftArm);
  const leftForeArm = toLocal(bones?.leftForeArm);
  const leftHand = toLocal(bones?.leftHand);
  const rightArm = toLocal(bones?.rightArm);
  const rightForeArm = toLocal(bones?.rightForeArm);
  const rightHand = toLocal(bones?.rightHand);
  alignCylinderToPoints(attire.meshes?.sleeveUpperL, leftArm, leftForeArm, 0.13);
  alignCylinderToPoints(attire.meshes?.sleeveLowerL, leftForeArm, leftHand, 0.11);
  alignCylinderToPoints(attire.meshes?.sleeveUpperR, rightArm, rightForeArm, 0.13);
  alignCylinderToPoints(attire.meshes?.sleeveLowerR, rightForeArm, rightHand, 0.11);
}

function applyAppearanceToScene(root, appearance) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    const meshName = String(node.name || "").toLowerCase();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const hostessMode = appearance.showHostessGown !== false;
    node.frustumCulled = false;
    node.castShadow = true;
    node.receiveShadow = true;
    if (meshName.startsWith("hair")) node.visible = appearance.showHair;
    if (meshName.startsWith("jacket")) node.visible = hostessMode ? false : appearance.showJacket;
    if (meshName.startsWith("wrap")) node.visible = hostessMode ? false : appearance.showWrap;
    if (meshName.startsWith("gloves")) node.visible = hostessMode ? false : appearance.showGloves;
    if (meshName.startsWith("top")) node.visible = hostessMode ? false : appearance.showTop;
    if (meshName.startsWith("underwear")) node.visible = hostessMode ? false : appearance.showBottoms;
    if (meshName.startsWith("stockings")) node.visible = appearance.showStockings;
    if (meshName.startsWith("boots")) node.visible = appearance.showBoots;
    if (meshName.startsWith("choker_spikes")) node.visible = appearance.showChoker;
    if (meshName.startsWith("piercing")) node.visible = appearance.showPiercing;

    for (const material of materials) {
      if (!material) continue;
      const materialName = String(material.name || "").toLowerCase();
      const label = `${meshName} ${materialName}`;
      const isSkin =
        label.includes("std_skin_head") ||
        label.includes("std_skin_body") ||
        label.includes("std_skin_arm") ||
        label.includes("std_skin_leg");
      const isHair =
        meshName.includes("hair") || label.includes("eyebrow") || label.includes("eyelash");
      const isEye = label.includes("std_eye") || label.includes("cornea");
      const isClothing =
        meshName.startsWith("jacket") ||
        meshName.startsWith("wrap") ||
        meshName.startsWith("gloves") ||
        meshName.startsWith("stockings") ||
        meshName.startsWith("boots") ||
        meshName.startsWith("top") ||
        meshName.startsWith("choker_spikes") ||
        meshName.startsWith("piercing") ||
        meshName.startsWith("underwear") ||
        label.includes("jacket") ||
        label.includes("gloves") ||
        label.includes("pantyhose") ||
        label.includes("boots") ||
        label.includes("top") ||
        label.includes("choker") ||
        label.includes("piercing") ||
        label.includes("metal");

      if ("side" in material) material.side = THREE.DoubleSide;
      if ("shadowSide" in material) material.shadowSide = THREE.DoubleSide;
      if ("depthWrite" in material) material.depthWrite = true;
      if ("depthTest" in material) material.depthTest = true;
      if ("roughness" in material) material.roughness = 0.68 + appearance.matte * 0.24;
      if ("metalness" in material) material.metalness = label.includes("metal") ? 0.3 : 0.02;
      if ("envMapIntensity" in material) material.envMapIntensity = label.includes("eye") ? 0.08 + appearance.eyeGlow * 0.12 : 0.03;

      if (isHair) {
        material.color?.set?.(appearance.hairColor);
        if ("emissive" in material && material.emissive?.set) {
          material.emissive.set(appearance.hairColor);
          material.emissive.multiplyScalar(0.02);
        }
        if ("emissiveIntensity" in material) material.emissiveIntensity = 0.08;
        if ("roughness" in material) material.roughness = 0.72 + appearance.matte * 0.16;
        if ("transparent" in material) material.transparent = true;
        if ("alphaTest" in material) material.alphaTest = 0.35;
      } else if (isSkin) {
        material.color?.set?.(appearance.skinColor);
        if ("roughness" in material) material.roughness = 0.88 + appearance.matte * 0.08;
        if ("transparent" in material) material.transparent = false;
        if ("opacity" in material) material.opacity = 1;
        if ("alphaTest" in material) material.alphaTest = 0;
      } else if (isEye) {
        if ("roughness" in material) material.roughness = 0.08;
      } else if (label.includes("teeth")) {
        material.color?.set?.("#f4e7ea");
        if ("roughness" in material) material.roughness = 0.42;
      } else if (label.includes("tongue")) {
        material.color?.set?.("#8a4a5e");
        if ("roughness" in material) material.roughness = 0.78;
      } else if (isClothing) {
        const tint = label.includes("metal") || label.includes("piercing") || label.includes("choker")
          ? appearance.accentColor
          : appearance.outfitColor;
        material.color?.set?.(tint);
        if ("transparent" in material && meshName.startsWith("stockings")) material.transparent = true;
        if ("opacity" in material && meshName.startsWith("stockings")) material.opacity = appearance.showStockings ? 0.82 : 0;
        if ("alphaTest" in material) material.alphaTest = meshName.startsWith("stockings") ? 0.18 : 0;
      } else {
        if ("transparent" in material) material.transparent = false;
      }
      material.needsUpdate = true;
    }
  });
}

export default function LenoreAvatar({
  className,
  modelUrl,
  reviewModelUrl,
  mood,
  isTalking,
  talkIntensity = 0.5,
  isListening,
  lipsyncSequence,
  lipsyncStartTimeMs = 0,
  backgroundSrc,
  avatarAppearance,
  avatarMotion
}) {
  const hostRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const clockRef = useRef(null);
  const frameRef = useRef(null);
  const rootBaseTransformRef = useRef({
    position: null,
    rotation: null,
    scale: null
  });
  const conversationPoseRef = useRef(null);
  const sceneBoundsRef = useRef({
    box: null,
    size: null,
    center: null
  });
  const appliedFrameRef = useRef("");
  const mixerRef = useRef(null);
  const motionActionsRef = useRef(new Map());
  const rootRef = useRef(null);
  const hostessAttireRef = useRef(null);
  const morphMeshesRef = useRef([]);
  const morphBaseRef = useRef([]);
  const bonesRef = useRef({
    head: null,
    neck: null,
    hips: null,
    leftShoulder: null,
    rightShoulder: null,
    leftArm: null,
    rightArm: null,
    leftForeArm: null,
    rightForeArm: null,
    leftHand: null,
    rightHand: null
  });
  const boneBaseRef = useRef({});
  const stateRef = useRef({
    mood,
    isTalking,
    talkIntensity,
    isListening,
    lipsyncSequence,
    lipsyncStartTimeMs,
    appearance: normalizeAppearance(avatarAppearance),
    motion: normalizeMotion(avatarMotion)
  });
  const [loadError, setLoadError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const appearance = useMemo(() => normalizeAppearance(avatarAppearance), [avatarAppearance]);
  const motion = useMemo(() => normalizeMotion(avatarMotion), [avatarMotion]);
  const activeModelUrl = useMemo(() => {
    const frame = String(appearance?.cameraFrame || "waist").toLowerCase();
    const wantsReviewModel = frame === "full";
    return wantsReviewModel && reviewModelUrl ? reviewModelUrl : modelUrl;
  }, [appearance?.cameraFrame, modelUrl, reviewModelUrl]);

  useEffect(() => {
    stateRef.current = {
      mood,
      isTalking,
      talkIntensity,
      isListening,
      lipsyncSequence,
      lipsyncStartTimeMs,
      appearance,
      motion
    };
  }, [mood, isTalking, talkIntensity, isListening, lipsyncSequence, lipsyncStartTimeMs, appearance, motion]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!hostRef.current || !activeModelUrl) return;
      setLoadError("");
      setIsReady(false);

      const width = hostRef.current.clientWidth || 680;
      const height = hostRef.current.clientHeight || 920;
      clockRef.current = new THREE.Clock();

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(30, width / height, 0.01, 100);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      rendererRef.current = renderer;
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffeef3, 2.1));
      const hemi = new THREE.HemisphereLight(0xfff4f7, 0x44202c, 1.2);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xffedf2, 4.1);
      key.position.set(0.7, 1.2, 1.8);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xd6a2b2, 1.7);
      fill.position.set(-1.1, 0.8, 1.1);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0x7d1736, 1.15);
      rim.position.set(0.2, 0.9, -1.4);
      scene.add(rim);

      try {
        const isFbx = isFbxModelUrl(activeModelUrl);
        const sanitizedModelUrl = String(activeModelUrl || "");
        const baseUrl = sanitizedModelUrl.replace(/[?#].*$/, "").replace(/[^/]+$/, "");
        let root;
        let animations = [];
        if (isFbx) {
          const loader = new FBXLoader();
          loader.setResourcePath(baseUrl);
          root = await loader.loadAsync(sanitizedModelUrl);
          animations = root?.animations || [];
        } else {
          const loader = new GLTFLoader();
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath("/vendor/draco/");
          loader.setDRACOLoader(dracoLoader);
          const gltf = await loader.loadAsync(sanitizedModelUrl);
          root = gltf.scene;
          animations = gltf.animations || [];
          dracoLoader.dispose();
        }
        if (cancelled) return;
        rootRef.current = root;
        scene.add(root);
        if (typeof window !== "undefined") {
          window.__lenoreDebug = {
            root,
            scene,
            camera,
            animations,
            motion: null
          };
        }
        if (animations.length) {
          const mixer = new THREE.AnimationMixer(root);
          const actionMap = new Map();
          for (const clip of animations) {
            const action = mixer.clipAction(clip);
            action.enabled = false;
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = false;
            action.paused = true;
            action.setEffectiveWeight(0);
            actionMap.set(clip.name, action);
          }
          mixerRef.current = mixer;
          motionActionsRef.current = actionMap;
        }

        const { box, size, center } = normalizeSceneTransform(root, isFbx);

        const morphMeshes = [];
        const bones = {
          head: null,
          neck: null,
          hips: null,
          leftShoulder: null,
          rightShoulder: null,
          leftArm: null,
          rightArm: null,
          leftForeArm: null,
          rightForeArm: null,
          leftHand: null,
          rightHand: null
        };
        root.traverse((node) => {
          if (node.isMesh && node.morphTargetDictionary && node.morphTargetInfluences) {
            morphMeshes.push(node);
          }
          if (node.isBone) {
            if (boneMatches(node, ["Head", "CC_Base_Head"])) bones.head = node;
            if (boneMatches(node, ["Neck", "CC_Base_NeckTwist02", "CC_Base_NeckTwist01"])) bones.neck = node;
            if (boneMatches(node, ["Hips", "CC_Base_Hip"])) bones.hips = node;
            if (boneMatches(node, ["LeftShoulder", "CC_Base_L_Clavicle"])) bones.leftShoulder = node;
            if (boneMatches(node, ["RightShoulder", "CC_Base_R_Clavicle"])) bones.rightShoulder = node;
            if (boneMatches(node, ["LeftArm", "CC_Base_L_Upperarm"])) bones.leftArm = node;
            if (boneMatches(node, ["RightArm", "CC_Base_R_Upperarm"])) bones.rightArm = node;
            if (boneMatches(node, ["LeftForeArm", "CC_Base_L_Forearm"])) bones.leftForeArm = node;
            if (boneMatches(node, ["RightForeArm", "CC_Base_R_Forearm"])) bones.rightForeArm = node;
            if (boneMatches(node, ["LeftHand", "CC_Base_L_Hand"])) bones.leftHand = node;
            if (boneMatches(node, ["RightHand", "CC_Base_R_Hand"])) bones.rightHand = node;
          }
        });
        const trackedMorphMeshes = morphMeshes
          .map((mesh) => ({
            mesh,
            role: categorizeMorphMesh(mesh)
          }))
          .filter((entry) => Boolean(entry.role));
        morphMeshesRef.current = trackedMorphMeshes;
        morphBaseRef.current = trackedMorphMeshes.map(({ mesh }) => {
          const influences = mesh.morphTargetInfluences || [];
          return Array.from(influences);
        });
        bonesRef.current = bones;
        boneBaseRef.current = Object.fromEntries(
          Object.entries(bones)
            .filter(([, bone]) => Boolean(bone))
            .map(([key, bone]) => [
              key,
              {
                quaternion: bone.quaternion.clone(),
                position: bone.position.clone(),
                scale: bone.scale.clone()
              }
            ])
        );
        root.updateMatrixWorld(true);
        rootBaseTransformRef.current = {
          position: root.position.clone(),
          rotation: root.rotation.clone(),
          scale: root.scale.clone()
        };
        sceneBoundsRef.current = { box, size, center };
        hostessAttireRef.current = buildHostessAttire(sceneBoundsRef.current, stateRef.current.appearance);
        root.add(hostessAttireRef.current.group);
        const cameraFrame = stateRef.current.appearance.cameraFrame || "bust";
        applyCameraFrame(camera, sceneBoundsRef.current, cameraFrame);
        appliedFrameRef.current = cameraFrame;
        applyAppearanceToScene(root, stateRef.current.appearance);
        updateHostessAttire(hostessAttireRef.current, stateRef.current.appearance, bonesRef.current, root);
        setIsReady(true);
      } catch (error) {
        setLoadError(error?.message || "lenore_load_failed");
        return;
      }

      let blinkTimer = 0;
      const animate = () => {
        const runtimeBase = stateRef.current;
        let runtime = runtimeBase;
        let blinkOverride = null;
        if (typeof window !== "undefined" && window.__lenoreDebug?.override) {
          const override = window.__lenoreDebug.override || {};
          if ("blink" in override) blinkOverride = Number(override.blink);
          runtime = {
            ...runtimeBase,
            ...("mood" in override ? { mood: override.mood } : {}),
            ...("isTalking" in override ? { isTalking: Boolean(override.isTalking) } : {}),
            ...("isListening" in override ? { isListening: Boolean(override.isListening) } : {}),
            ...("talkIntensity" in override ? { talkIntensity: Number(override.talkIntensity) || runtimeBase.talkIntensity } : {}),
            ...("lipsyncSequence" in override ? { lipsyncSequence: override.lipsyncSequence } : {}),
            ...("lipsyncStartTimeMs" in override ? { lipsyncStartTimeMs: Number(override.lipsyncStartTimeMs) || 0 } : {}),
            appearance: {
              ...runtimeBase.appearance,
              ...(override.appearance || {})
            },
            motion: {
              ...runtimeBase.motion,
              ...(override.motion || {})
            }
          };
        }
        const dt = clockRef.current ? clockRef.current.getDelta() : 0.016;
        const t = clockRef.current ? clockRef.current.elapsedTime : performance.now() / 1000;
        blinkTimer += dt;
        const root = rootRef.current;
        const meshes = morphMeshesRef.current;
        if (!root) return;

        applyAppearanceToScene(root, runtime.appearance);
        updateHostessAttire(hostessAttireRef.current, runtime.appearance, bonesRef.current, root);
        const cameraFrame = runtime.appearance.cameraFrame || "bust";
        if (cameraRef.current && sceneBoundsRef.current.size && cameraFrame !== appliedFrameRef.current) {
          applyCameraFrame(cameraRef.current, sceneBoundsRef.current, cameraFrame);
          appliedFrameRef.current = cameraFrame;
        }
        const animationEntries = Array.from(motionActionsRef.current.keys()).map((name) => ({ name }));
        const motionState = resolveMotionState(animationEntries, runtime);
        if (typeof window !== "undefined" && window.__lenoreDebug) {
          window.__lenoreDebug.motion = {
            selectedClipName: motionState.selectedClipName,
            clipKind: motionState.clipKind,
            choreographyPreset: runtime.motion.choreographyPreset,
            empathyMode: runtime.motion.empathyMode,
            responseClass: runtime.motion.responseClass,
            motionIntensity: runtime.motion.motionIntensity,
            idleState: runtime.motion.idleState
          };
        }
        for (const [key, bone] of Object.entries(bonesRef.current)) {
          if (!bone) continue;
          const base = boneBaseRef.current[key];
          if (!base) continue;
          bone.quaternion.copy(base.quaternion);
          bone.position.copy(base.position);
          bone.scale.copy(base.scale);
        }
        if (motionActionsRef.current.size) {
          for (const [, action] of motionActionsRef.current.entries()) {
            if (action.isRunning()) action.stop();
            action.enabled = false;
            action.paused = true;
            action.setEffectiveWeight(0);
          }
        }

        for (let i = 0; i < meshes.length; i += 1) {
          const mesh = meshes[i]?.mesh;
          if (!mesh?.morphTargetDictionary || !mesh?.morphTargetInfluences) continue;
          const influences = mesh.morphTargetInfluences;
          const base = morphBaseRef.current[i] || [];
          for (const [, index] of Object.entries(mesh.morphTargetDictionary)) {
            influences[index] = base[index] ?? 0;
          }
        }

        const targetConversation = computeLenoreConversationPose(runtime, motionState, t);
        const transitionAlpha = getLenoreTransitionAlpha(dt, targetConversation.stateName);
        const conversationPose = blendLenoreConversationPose(
          conversationPoseRef.current,
          targetConversation.pose,
          transitionAlpha
        );
        conversationPoseRef.current = conversationPose;
        const rootBase = rootBaseTransformRef.current;
        if (rootBase?.position && rootBase?.rotation && rootBase?.scale && rootRef.current) {
          rootRef.current.position.copy(rootBase.position);
          rootRef.current.rotation.copy(rootBase.rotation);
          rootRef.current.scale.copy(rootBase.scale);
          rootRef.current.position.y += conversationPose?.root?.y || 0;
          rootRef.current.position.x += conversationPose?.root?.x || 0;
          rootRef.current.rotation.y += conversationPose?.root?.rotY || 0;
          rootRef.current.rotation.x += conversationPose?.root?.rotX || 0;
        }
        if (bonesRef.current.hips) {
          bonesRef.current.hips.rotation.y = conversationPose?.hips?.y || 0;
        }
        if (bonesRef.current.neck) {
          bonesRef.current.neck.rotation.x = conversationPose?.neck?.x || 0;
          bonesRef.current.neck.rotation.y = conversationPose?.neck?.y || 0;
        }
        if (bonesRef.current.head) {
          bonesRef.current.head.rotation.x = conversationPose?.head?.x || 0;
          bonesRef.current.head.rotation.y = conversationPose?.head?.y || 0;
          bonesRef.current.head.rotation.z = conversationPose?.head?.z || 0;
        }
        if (bonesRef.current.leftShoulder) {
          bonesRef.current.leftShoulder.rotation.x = conversationPose?.leftShoulder?.x || 0;
          bonesRef.current.leftShoulder.rotation.y = conversationPose?.leftShoulder?.y || 0;
          bonesRef.current.leftShoulder.rotation.z = conversationPose?.leftShoulder?.z || 0;
        }
        if (bonesRef.current.rightShoulder) {
          bonesRef.current.rightShoulder.rotation.x = conversationPose?.rightShoulder?.x || 0;
          bonesRef.current.rightShoulder.rotation.y = conversationPose?.rightShoulder?.y || 0;
          bonesRef.current.rightShoulder.rotation.z = conversationPose?.rightShoulder?.z || 0;
        }
        if (bonesRef.current.leftArm) {
          bonesRef.current.leftArm.rotation.x = conversationPose?.leftArm?.x || 0;
          bonesRef.current.leftArm.rotation.y = conversationPose?.leftArm?.y || 0;
          bonesRef.current.leftArm.rotation.z = conversationPose?.leftArm?.z || 0;
        }
        if (bonesRef.current.rightArm) {
          bonesRef.current.rightArm.rotation.x = conversationPose?.rightArm?.x || 0;
          bonesRef.current.rightArm.rotation.y = conversationPose?.rightArm?.y || 0;
          bonesRef.current.rightArm.rotation.z = conversationPose?.rightArm?.z || 0;
        }
        if (bonesRef.current.leftForeArm) {
          bonesRef.current.leftForeArm.rotation.x = conversationPose?.leftForeArm?.x || 0;
          bonesRef.current.leftForeArm.rotation.y = conversationPose?.leftForeArm?.y || 0;
          bonesRef.current.leftForeArm.rotation.z = conversationPose?.leftForeArm?.z || 0;
        }
        if (bonesRef.current.rightForeArm) {
          bonesRef.current.rightForeArm.rotation.x = conversationPose?.rightForeArm?.x || 0;
          bonesRef.current.rightForeArm.rotation.y = conversationPose?.rightForeArm?.y || 0;
          bonesRef.current.rightForeArm.rotation.z = conversationPose?.rightForeArm?.z || 0;
        }
        if (bonesRef.current.leftHand && conversationPose?.leftHand) {
          bonesRef.current.leftHand.rotation.x = conversationPose.leftHand.x || 0;
          bonesRef.current.leftHand.rotation.y = conversationPose.leftHand.y || 0;
          bonesRef.current.leftHand.rotation.z = conversationPose.leftHand.z || 0;
        }
        if (bonesRef.current.rightHand && conversationPose?.rightHand) {
          bonesRef.current.rightHand.rotation.x = conversationPose.rightHand.x || 0;
          bonesRef.current.rightHand.rotation.y = conversationPose.rightHand.y || 0;
          bonesRef.current.rightHand.rotation.z = conversationPose.rightHand.z || 0;
        }

        const blink = blinkOverride == null
          ? clamp((1 - Math.pow(Math.abs(Math.sin(t * 0.28 + 0.7)), 42)) * 1.2, 0, 1)
          : clamp(blinkOverride, 0, 1);
        const elapsedMs = runtime.isTalking && runtime.lipsyncStartTimeMs
          ? Math.max(0, performance.now() - Number(runtime.lipsyncStartTimeMs || 0))
          : 0;
        const cueTargets = runtime.isTalking
          ? getLipsyncTargetsAtElapsed(runtime.lipsyncSequence, elapsedMs, runtime.talkIntensity)
          : null;
        const {
          idleTargets,
          moodTargets,
          blinkTargets,
          mouthTargets
        } = composeLenoreFaceTargets({
          runtime,
          t,
          blink,
          cueTargets,
          motionState
        });
        const safeIdleTargets = scaleTargetMap(filterTargetsToAllowedSet(idleTargets, SAFE_HEAD_TARGETS), 0.42);
        const safeMoodTargets = scaleTargetMap(filterTargetsToAllowedSet(moodTargets, SAFE_HEAD_TARGETS), 0.38);
        const safeBlinkTargets = scaleTargetMap(filterTargetsToAllowedSet(blinkTargets, SAFE_HEAD_TARGETS), 0.78);
        const safeMouthTargets = scaleTargetMap(filterTargetsToAllowedSet(mouthTargets, SAFE_HEAD_TARGETS), runtime.isTalking ? 0.34 : 0);
        const safeBrowMoodTargets = scaleTargetMap(filterTargetsToAllowedSet(moodTargets, SAFE_BROW_TARGETS), 0.34);
        const safeBrowBlinkTargets = scaleTargetMap(filterTargetsToAllowedSet(blinkTargets, SAFE_BROW_TARGETS), 0.82);
        const safeTongueTargets = scaleTargetMap(filterTargetsToAllowedSet(mouthTargets, SAFE_TONGUE_TARGETS), runtime.isTalking ? 0.18 : 0);

        for (const entry of meshes) {
          const mesh = entry?.mesh;
          const role = entry?.role;
          if (!mesh?.morphTargetDictionary || !mesh?.morphTargetInfluences) continue;
          if (role === "head") {
            applyMorphTargets(mesh.morphTargetDictionary, mesh.morphTargetInfluences, safeIdleTargets, "max");
            applyMorphTargets(mesh.morphTargetDictionary, mesh.morphTargetInfluences, safeMoodTargets, "max");
            applyMorphTargets(mesh.morphTargetDictionary, mesh.morphTargetInfluences, safeBlinkTargets, "max");
            applyMorphTargets(mesh.morphTargetDictionary, mesh.morphTargetInfluences, safeMouthTargets, "max");
          } else if (role === "brow" || role === "lash") {
            applyMorphTargets(mesh.morphTargetDictionary, mesh.morphTargetInfluences, safeBrowMoodTargets, "max");
            applyMorphTargets(mesh.morphTargetDictionary, mesh.morphTargetInfluences, safeBrowBlinkTargets, "max");
          } else if (role === "tongue") {
            applyMorphTargets(mesh.morphTargetDictionary, mesh.morphTargetInfluences, safeTongueTargets, "max");
          }
        }

        renderer.render(scene, camera);
        frameRef.current = requestAnimationFrame(animate);
      };
      animate();
    }

    init();
    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (mixerRef.current) mixerRef.current.stopAllAction();
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss?.();
      }
      if (hostRef.current) hostRef.current.innerHTML = "";
      if (typeof window !== "undefined" && window.__lenoreDebug?.root === rootRef.current) {
        delete window.__lenoreDebug;
      }
      rootRef.current = null;
      if (hostessAttireRef.current?.group?.parent) {
        hostessAttireRef.current.group.parent.remove(hostessAttireRef.current.group);
      }
      if (hostessAttireRef.current?.group) {
        hostessAttireRef.current.group.traverse((node) => {
          if (node.geometry?.dispose) node.geometry.dispose();
        });
      }
      if (hostessAttireRef.current?.materials) {
        hostessAttireRef.current.materials.outfitMaterial?.dispose?.();
        hostessAttireRef.current.materials.accentMaterial?.dispose?.();
      }
      hostessAttireRef.current = null;
      rootBaseTransformRef.current = {
        position: null,
        rotation: null,
        scale: null
      };
      morphMeshesRef.current = [];
      morphBaseRef.current = [];
      bonesRef.current = {
        head: null,
        neck: null,
        hips: null,
        leftShoulder: null,
        rightShoulder: null,
        leftArm: null,
        rightArm: null,
        leftForeArm: null,
        rightForeArm: null,
        leftHand: null,
        rightHand: null
      };
      boneBaseRef.current = {};
      sceneBoundsRef.current = {
        box: null,
        size: null,
        center: null
      };
      appliedFrameRef.current = "";
      mixerRef.current = null;
      motionActionsRef.current = new Map();
      clockRef.current = null;
    };
  }, [activeModelUrl]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !rendererRef.current || !cameraRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      rendererRef.current.setSize(rect.width, rect.height);
      cameraRef.current.aspect = rect.width / rect.height;
      applyCameraFrame(
        cameraRef.current,
        sceneBoundsRef.current,
        stateRef.current.appearance.cameraFrame || "bust"
      );
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const isVideoBackground = Boolean(backgroundSrc && /\.(mp4|webm|ogg)$/i.test(backgroundSrc));

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 24,
          background:
            "radial-gradient(circle at 50% 10%, rgba(255,244,247,0.28), transparent 24%), radial-gradient(circle at 50% 62%, rgba(157,54,89,0.2), transparent 42%), linear-gradient(180deg, #3c1522 0%, #592131 36%, #220d18 72%, #12060c 100%)",
          boxShadow: "inset 0 0 120px rgba(32,8,16,0.22), 0 26px 80px rgba(0,0,0,0.26)",
          zIndex: 0
        }}
      />
      {backgroundSrc && (
        isVideoBackground ? (
          <video
            src={backgroundSrc}
            autoPlay
            loop
            muted
            playsInline
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 24, zIndex: 0, opacity: 0.9 }}
          />
        ) : (
          <div
            style={{ position: "absolute", inset: 0, borderRadius: 24, backgroundImage: `url(${backgroundSrc})`, backgroundSize: "cover", backgroundPosition: "center", zIndex: 0, opacity: 0.9 }}
          />
        )
      )}
      <div
        ref={hostRef}
        style={{
          position: "absolute",
          inset: "2.5% 6.5% 3.5% 6.5%",
          borderRadius: 24,
          overflow: "hidden",
          outline: "1px solid rgba(255, 204, 220, 0.12)",
          background: "linear-gradient(180deg, rgba(74, 28, 42, 0.72), rgba(28, 10, 18, 0.84))",
          boxShadow: "inset 0 0 44px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.03)",
          zIndex: 1
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "2.5% 6.5% 3.5% 6.5%",
          borderRadius: 24,
          background: "linear-gradient(180deg, rgba(62, 21, 34, 0.98) 0%, rgba(62, 21, 34, 0.92) 10%, rgba(62, 21, 34, 0.18) 24%, rgba(62, 21, 34, 0) 34%)",
          pointerEvents: "none",
          zIndex: 1.5
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "2.5% 6.5% 3.5% 6.5%",
          borderRadius: 24,
          background: "radial-gradient(circle at 50% 20%, rgba(255,244,247,0.22), transparent 24%), radial-gradient(circle at 50% 78%, rgba(61,17,29,0.14), transparent 30%)",
          pointerEvents: "none",
          zIndex: 2
        }}
      />
      {!isReady && !loadError && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#f5e8eb", zIndex: 2, fontSize: 14, letterSpacing: "0.04em", background: "rgba(8, 6, 12, 0.42)" }}>
          Loading 3D avatar...
        </div>
      )}
      {loadError && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#ffd6df", zIndex: 2, fontSize: 13, padding: 16, textAlign: "center", background: "rgba(24, 8, 14, 0.88)" }}>
          {loadError}
        </div>
      )}
    </div>
  );
}
