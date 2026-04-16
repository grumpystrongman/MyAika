"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

THREE.Cache.enabled = true;

const DEFAULT_APPEARANCE = {
  cameraFrame: "bust",
  hairColor: "#09050a",
  skinColor: "#f3d9e2",
  lipColor: "#5b0c22",
  outfitColor: "#12070f",
  accentColor: "#5b1025",
  eyeGlow: 0.7,
  matte: 0.88,
  showHair: true,
  showJacket: false,
  showWrap: false,
  showGloves: true,
  showTop: true,
  showBottoms: true,
  showStockings: true,
  showBoots: true,
  showChoker: true,
  showPiercing: true
};

const DEFAULT_MOTION = {
  playClip: true,
  clipName: "auto",
  clipSpeed: 0.85,
  clipWeight: 1,
  idleHead: 0.35,
  talkHead: 0.2,
  bodySway: 0.2,
  choreographyPreset: "auto",
  responseClass: "neutral",
  motionIntensity: 0.45,
  idleState: "paused"
};

const GENERIC_BLENDSHAPE_MAP = {
  jawOpen: {
    Mouth_Lips_Jaw_Adjust: 0.82,
    Mouth_Open: 0.34,
    V_Open: 0.28
  },
  mouthOpen: {
    Mouth_Open: 0.92,
    Mouth_Lips_Part: 0.46,
    V_Open: 0.7
  },
  mouthPucker: {
    Mouth_Pucker: 0.92,
    Mouth_Pucker_Open: 0.68,
    V_Tight_O: 0.78
  },
  mouthFunnel: {
    Mouth_Pucker_Open: 0.9,
    Mouth_Pucker: 0.56,
    V_Tight_O: 0.76
  },
  mouthSmile: {
    Mouth_Smile: 0.82,
    Mouth_Widen: 0.42,
    V_Wide: 0.45
  },
  mouthFrown: {
    Mouth_Frown: 0.7,
    Mouth_Down: 0.32
  },
  browInnerUp: {
    Brow_Raise_Inner_Left: 0.68,
    Brow_Raise_Inner_Right: 0.68
  },
  browDownLeft: {
    Brow_Drop_Left: 0.72
  },
  browDownRight: {
    Brow_Drop_Right: 0.72
  }
};

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAppearance(input) {
  const next = { ...DEFAULT_APPEARANCE, ...(input || {}) };
  const frame = String(next.cameraFrame || DEFAULT_APPEARANCE.cameraFrame).toLowerCase();
  next.cameraFrame = ["portrait", "bust", "waist", "three_quarter", "full"].includes(frame) ? frame : DEFAULT_APPEARANCE.cameraFrame;
  next.eyeGlow = clamp(Number(next.eyeGlow ?? DEFAULT_APPEARANCE.eyeGlow), 0, 1);
  next.matte = clamp(Number(next.matte ?? DEFAULT_APPEARANCE.matte), 0.4, 1);
  return next;
}

function normalizeMotion(input) {
  const next = { ...DEFAULT_MOTION, ...(input || {}) };
  next.clipName = String(next.clipName || DEFAULT_MOTION.clipName).trim().toLowerCase() || DEFAULT_MOTION.clipName;
  next.clipSpeed = clamp(Number(next.clipSpeed ?? DEFAULT_MOTION.clipSpeed), 0, 2);
  next.clipWeight = clamp(Number(next.clipWeight ?? DEFAULT_MOTION.clipWeight), 0, 1);
  next.idleHead = clamp(Number(next.idleHead ?? DEFAULT_MOTION.idleHead), 0, 1);
  next.talkHead = clamp(Number(next.talkHead ?? DEFAULT_MOTION.talkHead), 0, 1);
  next.bodySway = clamp(Number(next.bodySway ?? DEFAULT_MOTION.bodySway), 0, 1);
  next.choreographyPreset = String(next.choreographyPreset || DEFAULT_MOTION.choreographyPreset).trim().toLowerCase() || DEFAULT_MOTION.choreographyPreset;
  next.motionIntensity = clamp(Number(next.motionIntensity ?? DEFAULT_MOTION.motionIntensity), 0, 1.5);
  next.responseClass = String(next.responseClass || DEFAULT_MOTION.responseClass).trim().toLowerCase() || DEFAULT_MOTION.responseClass;
  next.idleState = String(next.idleState || DEFAULT_MOTION.idleState).trim().toLowerCase() || DEFAULT_MOTION.idleState;
  next.playClip = Boolean(next.playClip);
  return next;
}

function resolvePreferredClipName(animations = [], runtime) {
  if (!animations.length) return "";
  const poseClip = animations.find((clip) => /lenoreruntimepose/i.test(clip.name));
  const sourceMotion = animations.find((clip) => /^armature\|.*tempmotion/i.test(clip.name) || /tempmotion/i.test(clip.name));
  const clipName = String(runtime?.motion?.clipName || "auto").toLowerCase();
  const choreographyPreset = String(runtime?.motion?.choreographyPreset || "auto").toLowerCase();
  const responseClass = String(runtime?.motion?.responseClass || "neutral").toLowerCase();
  const idleState = String(runtime?.motion?.idleState || "paused").toLowerCase();
  const isRestState = ["paused", "ready", "listening", "thinking"].includes(idleState) && !runtime?.isTalking;
  if (isRestState && poseClip) return poseClip.name;
  if (clipName === "runtime_pose" && poseClip) return poseClip.name;
  if (clipName === "source_motion" && sourceMotion) return sourceMotion.name;
  if (clipName === "auto") {
    if (choreographyPreset === "source_driven" && sourceMotion) return sourceMotion.name;
    if (["command_presence", "quiet_poise", "soft_reassure"].includes(choreographyPreset) && poseClip) return poseClip.name;
    if (choreographyPreset === "velvet_tease" && sourceMotion) return sourceMotion.name;
    if (
      (
        runtime?.isTalking ||
        runtime?.mood === "happy" ||
        runtime?.mood === "teasing" ||
        runtime?.mood === "surprised" ||
        ["teasing", "playful", "surprised"].includes(responseClass)
      ) &&
      sourceMotion
    ) {
      return sourceMotion.name;
    }
    if (["directive", "executive", "reflective", "comfort", "question"].includes(responseClass) && poseClip) {
      return poseClip.name;
    }
    if (poseClip) return poseClip.name;
  }
  return poseClip?.name || sourceMotion?.name || animations[0]?.name || "";
}

function resolveMotionState(animations = [], runtime) {
  const idleState = String(runtime.motion.idleState || "paused").toLowerCase();
  const requestedClipName = runtime.motion.playClip ? resolvePreferredClipName(animations, runtime) : "";
  const requestedClipKind = /lenoreruntimepose/i.test(requestedClipName)
    ? "runtime_pose"
    : /tempmotion/i.test(requestedClipName)
      ? "source_motion"
      : requestedClipName
        ? "other"
        : "none";
  const isRestState = ["paused", "ready", "listening", "thinking"].includes(idleState) && !runtime.isTalking;
  // The imported Lenore scene pose is a cleaner hostess rest than the exported runtime clip.
  // Keep the scene's neutral pose in rest/hostess states and reserve clip playback for source motion.
  const selectedClipName =
    requestedClipKind === "runtime_pose" || isRestState
      ? ""
      : requestedClipName;
  const clipKind =
    requestedClipKind === "runtime_pose" || isRestState
      ? "runtime_pose"
      : requestedClipKind;

  let clipSpeed = runtime.motion.clipSpeed;
  let clipWeight = runtime.motion.clipWeight;
  let idleHead = runtime.motion.idleHead;
  let talkHead = runtime.motion.talkHead;
  let bodySway = runtime.motion.bodySway;
  const choreographyPreset = String(runtime.motion.choreographyPreset || "auto").toLowerCase();
  const responseClass = String(runtime.motion.responseClass || "neutral");
  const motionIntensity = clamp(Number(runtime.motion.motionIntensity ?? 0.45), 0, 1.5);

  if (clipKind === "runtime_pose") {
    clipSpeed = 1;
    clipWeight = Math.min(1, clipWeight * 0.95);
    idleHead *= runtime.isListening ? 1.18 : 1;
    talkHead *= runtime.isTalking ? 1.2 : 0.85;
    bodySway *= runtime.isTalking ? 0.7 : 1;
  } else if (clipKind === "source_motion") {
    const moodBoost =
      runtime.mood === "happy" || runtime.mood === "teasing" || runtime.mood === "surprised"
        ? 1.18
        : runtime.mood === "thinking" || runtime.mood === "concerned"
          ? 0.78
          : 1;
    clipSpeed *= runtime.isTalking ? 1.08 * moodBoost : runtime.isListening ? 0.82 : 0.92;
    clipWeight *= runtime.isTalking ? 0.96 : runtime.isListening ? 0.74 : 0.82;
    idleHead *= 0.35;
    talkHead *= 0.52;
    bodySway *= runtime.isTalking ? 0.32 : 0.18;
  }

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
  } else if (choreographyPreset === "source_driven") {
    clipSpeed *= 1.02;
    talkHead *= 1.02;
    bodySway *= 1.04;
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

function getMoodTargets(runtime) {
  const responseClass = String(runtime?.motion?.responseClass || "neutral").toLowerCase();
  if (runtime.mood === "happy") {
    return {
      Mouth_Smile: 0.18,
      Brow_Raise_Outer_Left: 0.08,
      Brow_Raise_Outer_Right: 0.08,
      Cheek_Raise_L: 0.06,
      Cheek_Raise_R: 0.06
    };
  }
  if (runtime.mood === "teasing") {
    return {
      Mouth_Smile: 0.15,
      Mouth_Widen: 0.08,
      Brow_Raise_Outer_Left: 0.14,
      Brow_Drop_Right: 0.08,
      Eye_Squint_Left: 0.04
    };
  }
  if (runtime.mood === "thinking") {
    return {
      Brow_Drop_Left: 0.08,
      Brow_Drop_Right: 0.08,
      Mouth_Lips_Tight: 0.11
    };
  }
  if (runtime.mood === "concerned") {
    return {
      Mouth_Frown: 0.12,
      Brow_Raise_Inner_Left: 0.07,
      Brow_Raise_Inner_Right: 0.07
    };
  }
  if (runtime.mood === "surprised") {
    return {
      Eye_Wide_Left: 0.12,
      Eye_Wide_Right: 0.12,
      Brow_Raise_Outer_Left: 0.1,
      Brow_Raise_Outer_Right: 0.1
    };
  }
  if (responseClass === "comfort") {
    return {
      Mouth_Smile: 0.08,
      Brow_Raise_Inner_Left: 0.04,
      Brow_Raise_Inner_Right: 0.04
    };
  }
  if (responseClass === "directive" || responseClass === "executive") {
    return {
      Mouth_Lips_Tight: 0.1,
      Brow_Drop_Left: 0.05,
      Brow_Drop_Right: 0.05
    };
  }
  if (responseClass === "question") {
    return {
      Brow_Raise_Outer_Left: 0.09,
      Brow_Raise_Outer_Right: 0.04,
      Mouth_Lips_Part: 0.05
    };
  }
  return {};
}

function phonemeToTargets(phoneme = "") {
  const key = String(phoneme || "").toLowerCase().trim();
  if (["m", "b", "p"].includes(key)) return { Mouth_Plosive: 0.98, V_Explosive: 0.82, Mouth_Lips_Tight: 0.42, Mouth_Lips_Part: 0.02, Mouth_Open: 0.01 };
  if (["f", "v"].includes(key)) return { V_Dental_Lip: 0.86, Mouth_Bottom_Lip_Bite: 0.68, Mouth_Lips_Part: 0.08, Mouth_Open: 0.03 };
  if (["o", "u", "w"].includes(key)) return { Mouth_Pucker: 0.58, Mouth_Pucker_Open: 0.62, V_Tight_O: 0.82, Mouth_Lips_Part: 0.16, Mouth_Open: 0.08 };
  if (["e", "i", "y"].includes(key)) return { Mouth_Widen: 0.54, Mouth_Smile: 0.1, V_Wide: 0.72, Mouth_Lips_Part: 0.18, Mouth_Open: 0.1 };
  if (["a", "h"].includes(key)) return { Mouth_Open: 0.62, Mouth_Lips_Part: 0.34, V_Open: 0.72, Mouth_Lips_Jaw_Adjust: 0.28 };
  if (["s", "z"].includes(key)) return { V_Affricate: 0.52, V_Dental_Lip: 0.2, Mouth_Lips_Part: 0.11, Mouth_Open: 0.02, Mouth_Widen: 0.14, Mouth_Top_Lip_Up: 0.08 };
  if (["ch", "j", "sh"].includes(key)) return { V_Affricate: 0.82, Mouth_Lips_Part: 0.18, Mouth_Open: 0.05, Mouth_Widen: 0.1, Mouth_Pucker_Open: 0.08, Mouth_Top_Lip_Up: 0.04 };
  if (key === "th") return { V_Dental_Lip: 0.32, Mouth_Top_Lip_Up: 0.24, V_Tongue_Out: 0.48, Mouth_Lips_Part: 0.12, Mouth_Open: 0.04 };
  if (["n", "l", "d", "t", "r"].includes(key)) return { Mouth_Lips_Part: 0.18, Mouth_Open: 0.08, V_Tongue_up: 0.16, Mouth_Lips_Tight: 0.06 };
  if (["k", "g", "c", "q"].includes(key)) return { Mouth_Lips_Part: 0.16, Mouth_Open: 0.12, Mouth_Lips_Jaw_Adjust: 0.14 };
  return {};
}

function stabilizeMouthTargets(targets = {}) {
  const next = { ...targets };
  const pucker = Math.max(next.Mouth_Pucker || 0, next.Mouth_Pucker_Open || 0, next.V_Tight_O || 0);
  const wide = Math.max(next.Mouth_Widen || 0, next.V_Wide || 0);
  const plosive = Math.max(next.Mouth_Plosive || 0, next.V_Explosive || 0);
  const affricate = Math.max(next.V_Affricate || 0, next.V_Dental_Lip || 0);

  if (pucker > 0.4) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.18);
    next.V_Open = Math.min(next.V_Open || 0, 0.22);
  }
  if (wide > 0.4) {
    next.Mouth_Pucker = Math.min(next.Mouth_Pucker || 0, 0.08);
    next.Mouth_Pucker_Open = Math.min(next.Mouth_Pucker_Open || 0, 0.12);
  }
  if (plosive > 0.35) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.04);
    next.Mouth_Lips_Part = Math.min(next.Mouth_Lips_Part || 0, 0.08);
  }
  if (affricate > 0.35) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.1);
    next.Mouth_Pucker = Math.min(next.Mouth_Pucker || 0, 0.12);
  }
  if ((next.V_Tongue_Out || 0) > 0.2) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.08);
    next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.11), 0.18);
    next.V_Dental_Lip = Math.min(next.V_Dental_Lip || 0, 0.48);
  }
  if ((next.V_Affricate || 0) > 0.45) {
    next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.08);
    next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.12), 0.2);
    next.V_Tongue_Out = Math.min(next.V_Tongue_Out || 0, 0.08);
    next.Mouth_Top_Lip_Up = Math.max(next.Mouth_Top_Lip_Up || 0, 0.06);
  }
  next.Mouth_Open = clamp(next.Mouth_Open || 0, 0, 0.72);
  next.V_Open = clamp(next.V_Open || 0, 0, 0.8);
  next.Mouth_Lips_Part = clamp(next.Mouth_Lips_Part || 0, 0, 0.46);
  next.V_Tongue_Out = clamp(next.V_Tongue_Out || 0, 0, 0.6);
  next.Mouth_Top_Lip_Up = clamp(next.Mouth_Top_Lip_Up || 0, 0, 0.4);
  return next;
}

function mergeTargetMaps(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      out[key] = Math.max(out[key] || 0, Number(value) || 0);
    }
  }
  return out;
}

function scaleTargets(targets, scale = 1) {
  const out = {};
  for (const [key, value] of Object.entries(targets || {})) {
    out[key] = (Number(value) || 0) * scale;
  }
  return out;
}

function blendTargetMaps(fromTargets, toTargets, weight) {
  const out = {};
  const keys = new Set([
    ...Object.keys(fromTargets || {}),
    ...Object.keys(toTargets || {})
  ]);
  for (const key of keys) {
    const fromValue = fromTargets?.[key] || 0;
    const toValue = toTargets?.[key] || 0;
    out[key] = fromValue + (toValue - fromValue) * weight;
  }
  return out;
}

function mapGenericBlendshapesToLenore(blendshapes = {}) {
  const out = {};
  for (const [key, value] of Object.entries(blendshapes || {})) {
    const normalizedKey = String(key || "").trim();
    const amount = Number(value) || 0;
    if (!amount) continue;
    const mapped = GENERIC_BLENDSHAPE_MAP[normalizedKey];
    if (mapped) {
      for (const [targetName, targetValue] of Object.entries(mapped)) {
        out[targetName] = Math.max(out[targetName] || 0, targetValue * amount);
      }
      continue;
    }
    out[normalizedKey] = Math.max(out[normalizedKey] || 0, amount);
  }
  return out;
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

function buildCueTargets(cue, talkIntensity = 0.5) {
  const phonemeTargets = phonemeToTargets(cue?.phoneme || "");
  const genericTargets = scaleTargets(mapGenericBlendshapesToLenore(cue?.blendshapes || {}), 0.6);
  const duration = Math.max(40, Number(cue?.duration) || 90);
  const durationScale = duration < 70 ? 0.82 : duration > 150 ? 1.06 : 0.94;
  const scale = (0.68 + clamp(talkIntensity, 0, 1) * 0.26) * durationScale;
  return stabilizeMouthTargets(scaleTargets(mergeTargetMaps(genericTargets, phonemeTargets), scale));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * (3 - 2 * t);
}

function getLipsyncTargetsAtElapsed(lipsyncSequence, elapsedMs, talkIntensity) {
  const seq = Array.isArray(lipsyncSequence?.sequences) ? lipsyncSequence.sequences : [];
  if (!seq.length) return null;

  let index = seq.findIndex((item) => elapsedMs < item.time + item.duration);
  if (index < 0) index = seq.length - 1;
  const current = seq[index];
  if (!current) return null;
  const next = seq[index + 1] || null;
  const prev = seq[index - 1] || null;
  const currentTargets = buildCueTargets(current, talkIntensity);

  const currentEnd = current.time + current.duration;
  const fadeWindow = Math.min(95, Math.max(50, current.duration * 0.42));
  let currentWeight = 1;
  let nextWeight = 0;

  if (elapsedMs < current.time) {
    currentWeight = smoothstep(current.time - fadeWindow, current.time, elapsedMs);
  } else if (elapsedMs > currentEnd - fadeWindow) {
    currentWeight = 1 - smoothstep(currentEnd - fadeWindow, currentEnd, elapsedMs);
  }

  if (next) {
    const nextTargets = buildCueTargets(next, talkIntensity);
    if (elapsedMs >= currentEnd - fadeWindow) {
      nextWeight = smoothstep(currentEnd - fadeWindow, currentEnd + fadeWindow, elapsedMs);
      return tightenConsonantClusters(
        blendTargetMaps(
          scaleTargets(currentTargets, clamp(currentWeight, 0, 1)),
          scaleTargets(nextTargets, clamp(nextWeight, 0, 1)),
          0.5
        ),
        prev,
        current,
        next
      );
    }
  }

  return tightenConsonantClusters(scaleTargets(currentTargets, clamp(currentWeight, 0.25, 1)), prev, current, next);
}

function getPhonemeFamily(phoneme = "") {
  const key = String(phoneme || "").toLowerCase().trim();
  if (["m", "b", "p"].includes(key)) return "plosive";
  if (["f", "v", "th"].includes(key)) return "dental";
  if (["ch", "j", "sh", "s", "z"].includes(key)) return "affricate";
  if (["n", "l", "d", "t", "r", "k", "g", "c", "q"].includes(key)) return "consonant";
  if (["o", "u", "w"].includes(key)) return "rounded";
  if (["e", "i", "y"].includes(key)) return "wide";
  if (["a", "h"].includes(key)) return "open";
  return "other";
}

function tightenConsonantClusters(targets, prevCue, currentCue, nextCue) {
  const next = { ...(targets || {}) };
  const currentFamily = getPhonemeFamily(currentCue?.phoneme);
  const prevFamily = getPhonemeFamily(prevCue?.phoneme);
  const nextFamily = getPhonemeFamily(nextCue?.phoneme);
  const currentDuration = Number(currentCue?.duration) || 90;
  const nextGap = nextCue ? Math.max(0, Number(nextCue.time || 0) - (Number(currentCue?.time || 0) + currentDuration)) : 999;
  const prevGap = prevCue ? Math.max(0, Number(currentCue?.time || 0) - (Number(prevCue.time || 0) + (Number(prevCue.duration) || 90))) : 999;
  const isConsonant = ["plosive", "dental", "affricate", "consonant"].includes(currentFamily);
  const isCluster =
    isConsonant &&
    (
      (["plosive", "dental", "affricate", "consonant"].includes(prevFamily) && prevGap < 70) ||
      (["plosive", "dental", "affricate", "consonant"].includes(nextFamily) && nextGap < 70) ||
      currentDuration < 72
    );
  if (!isCluster) return next;

  next.Mouth_Open = Math.min(next.Mouth_Open || 0, 0.1);
  next.V_Open = Math.min(next.V_Open || 0, 0.16);
  next.Mouth_Lips_Jaw_Adjust = Math.min(next.Mouth_Lips_Jaw_Adjust || 0, 0.18);
  next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.1), 0.22);

  if (currentFamily === "plosive") {
    next.Mouth_Lips_Tight = Math.max(next.Mouth_Lips_Tight || 0, 0.42);
    next.Mouth_Plosive = Math.max(next.Mouth_Plosive || 0, 0.86);
  } else if (currentFamily === "dental") {
    next.V_Dental_Lip = Math.max(next.V_Dental_Lip || 0, 0.6);
    if (String(currentCue?.phoneme || "").toLowerCase() === "th") {
      next.V_Tongue_Out = Math.max(next.V_Tongue_Out || 0, 0.38);
      next.Mouth_Top_Lip_Up = Math.max(next.Mouth_Top_Lip_Up || 0, 0.16);
      next.Mouth_Bottom_Lip_Bite = Math.min(next.Mouth_Bottom_Lip_Bite || 0, 0.12);
      next.Mouth_Lips_Part = Math.min(Math.max(next.Mouth_Lips_Part || 0, 0.12), 0.18);
    } else {
      next.Mouth_Bottom_Lip_Bite = Math.max(next.Mouth_Bottom_Lip_Bite || 0, 0.32);
    }
  } else if (currentFamily === "affricate") {
    next.V_Affricate = Math.max(next.V_Affricate || 0, 0.7);
    next.Mouth_Widen = Math.max(next.Mouth_Widen || 0, 0.12);
    next.V_Tongue_Out = Math.min(next.V_Tongue_Out || 0, 0.05);
    next.Mouth_Top_Lip_Up = Math.max(next.Mouth_Top_Lip_Up || 0, 0.08);
  }
  return next;
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
      height: size.y * 0.48,
      headroom: size.y * 0.08,
      width: size.x * 0.26,
      minDistance: 1.45
    },
    bust: {
      height: size.y * 0.62,
      headroom: size.y * 0.06,
      width: size.x * 0.34,
      minDistance: 1.65
    },
    waist: {
      height: size.y * 0.82,
      headroom: size.y * 0.045,
      width: size.x * 0.46,
      minDistance: 1.95
    },
    three_quarter: {
      height: size.y * 0.94,
      headroom: size.y * 0.04,
      width: size.x * 0.56,
      minDistance: 2.18
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

function getHostessChoreography(runtime, t, motionState) {
  const responseClass = String(runtime.motion.responseClass || "neutral").toLowerCase();
  const idleState = String(runtime.motion.idleState || "paused").toLowerCase();
  const choreographyPreset = String(runtime.motion.choreographyPreset || "auto").toLowerCase();
  const intensity = clamp(Number(runtime.motion.motionIntensity ?? 0.45), 0, 1.5);
  const talkWeight = runtime.isTalking ? 1 : 0;
  const listenWeight = runtime.isListening ? 1 : 0;
  const base = {
    hipsY: Math.sin(t * 0.58) * 0.02,
    neckX: -0.012 + Math.sin(t * 1.05) * 0.006,
    neckY: Math.sin(t * 0.76) * 0.018,
    headX: Math.sin(t * 0.94) * 0.014 + listenWeight * 0.014 + talkWeight * 0.01,
    headY: Math.sin(t * 0.68) * 0.028 + talkWeight * Math.sin(t * 1.9) * 0.01,
    headZ: Math.sin(t * 0.5) * 0.008,
    leftShoulderZ: -0.022 + Math.sin(t * 0.72) * 0.01,
    rightShoulderZ: 0.022 - Math.sin(t * 0.66) * 0.01,
    leftArmZ: -0.03,
    rightArmZ: 0.03,
    leftForeArmZ: -0.02,
    rightForeArmZ: 0.02
  };

  if (responseClass === "teasing") {
    base.headZ += 0.018;
    base.headY += 0.016;
    base.leftShoulderZ += 0.018;
    base.rightShoulderZ -= 0.008;
    base.leftArmZ -= 0.035;
    base.leftForeArmZ -= 0.05;
  } else if (responseClass === "comfort") {
    base.neckX += 0.01;
    base.headX += 0.014;
    base.leftArmZ += 0.018;
    base.rightArmZ -= 0.018;
    base.leftForeArmZ += 0.028;
    base.rightForeArmZ -= 0.028;
  } else if (responseClass === "directive" || responseClass === "executive") {
    base.hipsY *= 0.55;
    base.headY *= 0.55;
    base.headZ *= 0.2;
    base.leftShoulderZ -= 0.012;
    base.rightShoulderZ += 0.012;
    base.leftArmZ += 0.012;
    base.rightArmZ -= 0.012;
  } else if (responseClass === "reflective" || responseClass === "question") {
    base.neckX -= 0.008;
    base.headY += 0.01;
    base.headZ += 0.008;
    base.leftShoulderZ += 0.01;
  } else if (responseClass === "surprised" || responseClass === "playful") {
    base.headX += 0.012;
    base.headY += 0.014;
    base.leftShoulderZ += 0.008;
    base.rightShoulderZ -= 0.008;
  }

  if (choreographyPreset === "velvet_tease") {
    base.headZ += 0.026;
    base.headY += 0.012;
    base.leftShoulderZ += 0.022;
    base.leftArmZ -= 0.042;
    base.leftForeArmZ -= 0.058;
  } else if (choreographyPreset === "command_presence") {
    base.hipsY *= 0.45;
    base.headZ *= 0.18;
    base.leftShoulderZ -= 0.016;
    base.rightShoulderZ += 0.016;
    base.leftArmZ += 0.014;
    base.rightArmZ -= 0.014;
  } else if (choreographyPreset === "soft_reassure") {
    base.neckX += 0.014;
    base.headX += 0.016;
    base.leftArmZ += 0.024;
    base.rightArmZ -= 0.024;
    base.leftForeArmZ += 0.032;
    base.rightForeArmZ -= 0.032;
  } else if (choreographyPreset === "quiet_poise") {
    base.hipsY *= 0.22;
    base.headY *= 0.4;
    base.headZ *= 0.24;
    base.leftShoulderZ = -0.014;
    base.rightShoulderZ = 0.014;
    base.leftArmZ = -0.018;
    base.rightArmZ = 0.018;
  } else if (choreographyPreset === "source_driven") {
    base.headY += Math.sin(t * 1.2) * 0.008;
    base.leftShoulderZ += 0.008;
    base.rightShoulderZ -= 0.008;
  }

  if (idleState === "paused") {
    const invite = (Math.sin(t * 0.42) + 1) * 0.5;
    base.hipsY = Math.sin(t * 0.62) * 0.014;
    base.neckX = -0.014 + Math.sin(t * 0.44) * 0.008;
    base.neckY = Math.sin(t * 0.48) * 0.016;
    base.headX = 0.02 + Math.sin(t * 0.6) * 0.02;
    base.headY = Math.sin(t * 0.44) * 0.024;
    base.headZ = 0.012 + Math.sin(t * 0.38) * 0.01;
    base.leftShoulderZ = -0.018 + invite * 0.01;
    base.rightShoulderZ = 0.018 - invite * 0.01;
    base.leftArmZ = -0.012 - invite * 0.008;
    base.rightArmZ = 0.012 + invite * 0.008;
    base.leftForeArmZ = -0.012 - invite * 0.012;
    base.rightForeArmZ = 0.012 + invite * 0.012;
  } else if (idleState === "ready") {
    base.hipsY *= 0.55;
    base.headX = base.headX * 0.75 + 0.008;
    base.headY *= 0.66;
    base.headZ += 0.006;
    base.leftShoulderZ *= 0.78;
    base.rightShoulderZ *= 0.78;
    base.leftForeArmZ -= 0.01;
    base.rightForeArmZ += 0.01;
  } else if (idleState === "listening") {
    base.neckX += 0.02;
    base.headX += 0.024;
    base.headY += 0.01;
    base.leftShoulderZ += 0.014;
    base.rightShoulderZ -= 0.014;
    base.leftArmZ -= 0.02;
    base.rightArmZ += 0.02;
  } else if (idleState === "thinking") {
    base.hipsY *= 0.3;
    base.neckX -= 0.014;
    base.headY += 0.018;
    base.headZ += 0.012;
    base.leftShoulderZ += 0.01;
    base.leftForeArmZ -= 0.022;
  } else if (idleState === "speaking") {
    base.headX += 0.01;
    base.headY += Math.sin(t * 1.75) * 0.014;
    base.leftShoulderZ += 0.012;
    base.rightShoulderZ -= 0.008;
  }

  const clipOverlay = motionState.clipKind === "source_motion" ? 0.32 : motionState.clipKind === "runtime_pose" ? 0.72 : 1;
  const scale = (0.92 + intensity * 0.1) * clipOverlay;
  for (const key of Object.keys(base)) base[key] *= scale;

  if (["paused", "ready", "listening", "thinking"].includes(idleState) && !runtime.isTalking) {
    base.leftShoulderZ -= 1.02;
    base.rightShoulderZ += 1.02;
    base.leftArmZ -= 1.34;
    base.rightArmZ += 1.34;
    base.leftForeArmZ -= 0.18;
    base.rightForeArmZ += 0.18;
  }
  return base;
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

function applyAppearanceToScene(root, appearance) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    const meshName = String(node.name || "").toLowerCase();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    node.frustumCulled = false;
    node.castShadow = true;
    node.receiveShadow = true;
    if (meshName.startsWith("hair")) node.visible = appearance.showHair;
    if (meshName.startsWith("jacket")) node.visible = appearance.showJacket;
    if (meshName.startsWith("wrap")) node.visible = appearance.showWrap;
    if (meshName.startsWith("gloves")) node.visible = appearance.showGloves;
    if (meshName.startsWith("top")) node.visible = appearance.showTop;
    if (meshName.startsWith("underwear")) node.visible = appearance.showBottoms;
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
        meshName.startsWith("underwear") ||
        label.includes("jacket") ||
        label.includes("gloves") ||
        label.includes("pantyhose") ||
        label.includes("boots") ||
        label.includes("top");

      if ("side" in material) material.side = THREE.DoubleSide;
      if ("shadowSide" in material) material.shadowSide = THREE.DoubleSide;
      if ("depthWrite" in material) material.depthWrite = true;
      if ("depthTest" in material) material.depthTest = true;
      if ("roughness" in material) material.roughness = 0.68 + appearance.matte * 0.24;
      if ("metalness" in material) material.metalness = label.includes("metal") ? 0.3 : 0.02;
      if ("envMapIntensity" in material) material.envMapIntensity = label.includes("eye") ? 0.3 + appearance.eyeGlow * 0.25 : 0.06;

      if (isHair) {
        material.color?.set?.(appearance.hairColor);
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
  const mixerRef = useRef(null);
  const motionActionsRef = useRef(new Map());
  const rootRef = useRef(null);
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
    rightForeArm: null
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
      if (!hostRef.current || !modelUrl) return;
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
        const isFbx = isFbxModelUrl(modelUrl);
        const sanitizedModelUrl = String(modelUrl || "");
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
          rightForeArm: null
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
          }
        });
        morphMeshesRef.current = morphMeshes;
        morphBaseRef.current = morphMeshes.map((mesh) => [...mesh.morphTargetInfluences]);
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
        const cameraFrame = stateRef.current.appearance.cameraFrame || "bust";
        const frameConfig = getFrameConfig(cameraFrame, size);
        const maxY = box.max.y;
        const minY = box.min.y;
        const targetHeight = frameConfig.height;
        const headroom = frameConfig.headroom;
        const targetTop = maxY + headroom;
        const targetBottom = cameraFrame === "full" ? minY - size.y * 0.03 : targetTop - targetHeight;
        const focusY = (targetTop + targetBottom) / 2;
        const fovRadians = THREE.MathUtils.degToRad(camera.fov);
        const fitDistanceY = ((targetTop - targetBottom) / 2) / Math.tan(fovRadians / 2);
        const horizontalTan = Math.tan((fovRadians * camera.aspect) / 2);
        const widthForFit = frameConfig.width;
        const fitDistanceX = widthForFit / Math.max(horizontalTan, 0.1);
        const distance = Math.max(fitDistanceY, fitDistanceX, frameConfig.minDistance);
        camera.position.set(center.x, focusY, center.z + distance);
        camera.lookAt(center.x, focusY, center.z);
        applyAppearanceToScene(root, stateRef.current.appearance);
        setIsReady(true);
      } catch (error) {
        setLoadError(error?.message || "lenore_load_failed");
        return;
      }

      let blinkTimer = 0;
      const animate = () => {
        const runtimeBase = stateRef.current;
        let runtime = runtimeBase;
        if (typeof window !== "undefined" && window.__lenoreDebug?.override) {
          const override = window.__lenoreDebug.override || {};
          runtime = {
            ...runtimeBase,
            ...("mood" in override ? { mood: override.mood } : {}),
            ...("isTalking" in override ? { isTalking: Boolean(override.isTalking) } : {}),
            ...("isListening" in override ? { isListening: Boolean(override.isListening) } : {}),
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
        const animationEntries = Array.from(motionActionsRef.current.keys()).map((name) => ({ name }));
        const motionState = resolveMotionState(animationEntries, runtime);
        if (typeof window !== "undefined" && window.__lenoreDebug) {
          window.__lenoreDebug.motion = {
            selectedClipName: motionState.selectedClipName,
            clipKind: motionState.clipKind,
            choreographyPreset: runtime.motion.choreographyPreset,
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
          for (const [name, action] of motionActionsRef.current.entries()) {
            const enabled = Boolean(motionState.selectedClipName) && name === motionState.selectedClipName && motionState.clipWeight > 0.001;
            if (enabled) {
              if (!action.isRunning()) action.reset().play();
              action.enabled = true;
              action.paused = false;
              action.setEffectiveWeight(motionState.clipWeight);
            } else {
              if (action.isRunning()) action.stop();
              action.enabled = false;
              action.paused = true;
              action.setEffectiveWeight(0);
            }
          }
        }
        if (mixerRef.current && motionActionsRef.current.size && runtime.motion.playClip && motionState.selectedClipName) {
          mixerRef.current.update(dt * motionState.clipSpeed);
        }

        const elapsedMs =
          runtime.isTalking && runtime.lipsyncStartTimeMs
            ? Math.max(0, performance.now() - runtime.lipsyncStartTimeMs)
            : 0;
        const cueTargets =
          runtime.isTalking && runtime.lipsyncSequence?.sequences?.length && runtime.lipsyncStartTimeMs
            ? getLipsyncTargetsAtElapsed(runtime.lipsyncSequence, elapsedMs, runtime.talkIntensity)
            : null;

        for (const mesh of meshes) {
          if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
          const dict = mesh.morphTargetDictionary;
          const influences = mesh.morphTargetInfluences;
          const base = morphBaseRef.current[morphMeshesRef.current.indexOf(mesh)] || [];
          for (const [name, index] of Object.entries(dict)) {
            influences[index] = base[index] ?? 0;
          }

          if (blinkTimer > 3.5) {
            const blinkValue = Math.max(0, 1 - Math.abs(((blinkTimer - 3.5) / 0.12) - 1));
            if (dict.Eye_Blink_L != null) influences[dict.Eye_Blink_L] = Math.max(influences[dict.Eye_Blink_L], blinkValue);
            if (dict.Eye_Blink_R != null) influences[dict.Eye_Blink_R] = Math.max(influences[dict.Eye_Blink_R], blinkValue);
            if (blinkTimer > 3.74) blinkTimer = 0;
          }

          applyMorphTargets(dict, influences, getMoodTargets(runtime));

          if (runtime.isListening) {
            applyMorphTargets(dict, influences, {
              Brow_Raise_Inner_Left: 0.04,
              Brow_Raise_Inner_Right: 0.04,
              Eye_Wide_Left: 0.03,
              Eye_Wide_Right: 0.03
            });
          }

          if (cueTargets) {
            applyMorphTargets(dict, influences, cueTargets);
          } else if (runtime.isTalking) {
            const pulse = (Math.sin(t * 6.3) + 1) * 0.5;
            const fallbackTargets = {
              Mouth_Open: 0.05 + pulse * 0.14,
              Mouth_Lips_Part: 0.06 + pulse * 0.08,
              V_Open: 0.04 + pulse * 0.12
            };
            applyMorphTargets(dict, influences, fallbackTargets);
          }
        }

        const choreography = getHostessChoreography(runtime, t, motionState);
        const idleState = String(runtime.motion.idleState || "paused").toLowerCase();
        const isHostessRestState = ["paused", "ready", "listening", "thinking"].includes(idleState) && !runtime.isTalking;
        const rootBase = rootBaseTransformRef.current;
        if (rootBase?.position && rootBase?.rotation && rootBase?.scale && rootRef.current) {
          const breath = (Math.sin(t * 1.18) + 1) * 0.5;
          const sway = Math.sin(t * (runtime.isTalking ? 1.5 : runtime.isListening ? 1.0 : 0.82));
          const turn = Math.sin(t * 0.48);
          rootRef.current.position.copy(rootBase.position);
          rootRef.current.rotation.copy(rootBase.rotation);
          rootRef.current.scale.copy(rootBase.scale);
          rootRef.current.position.y += 0.012 + breath * 0.02;
          rootRef.current.position.x += sway * 0.012;
          rootRef.current.rotation.y += turn * 0.028;
          rootRef.current.rotation.x += runtime.isTalking ? 0.012 : 0.006;
        }
        if (bonesRef.current.hips) {
          bonesRef.current.hips.rotation.y = choreography.hipsY * motionState.bodySway;
        }
        if (bonesRef.current.neck) {
          bonesRef.current.neck.rotation.x = choreography.neckX * motionState.idleHead;
          bonesRef.current.neck.rotation.y = choreography.neckY * motionState.idleHead;
        }
        if (bonesRef.current.head) {
          const headScale = Math.max(motionState.idleHead, motionState.talkHead);
          bonesRef.current.head.rotation.x = choreography.headX * headScale;
          bonesRef.current.head.rotation.y = choreography.headY * headScale;
          bonesRef.current.head.rotation.z = choreography.headZ * motionState.idleHead;
        }
        if (bonesRef.current.leftShoulder) {
          bonesRef.current.leftShoulder.rotation.z = choreography.leftShoulderZ * motionState.bodySway;
        }
        if (bonesRef.current.rightShoulder) {
          bonesRef.current.rightShoulder.rotation.z = choreography.rightShoulderZ * motionState.bodySway;
        }
        if (bonesRef.current.leftArm) {
          bonesRef.current.leftArm.rotation.z = choreography.leftArmZ * Math.max(motionState.bodySway, motionState.talkHead);
        }
        if (bonesRef.current.rightArm) {
          bonesRef.current.rightArm.rotation.z = choreography.rightArmZ * Math.max(motionState.bodySway, motionState.talkHead);
        }
        if (bonesRef.current.leftForeArm) {
          bonesRef.current.leftForeArm.rotation.z = choreography.leftForeArmZ * Math.max(motionState.bodySway, motionState.talkHead);
        }
        if (bonesRef.current.rightForeArm) {
          bonesRef.current.rightForeArm.rotation.z = choreography.rightForeArmZ * Math.max(motionState.bodySway, motionState.talkHead);
        }
        if (isHostessRestState) {
          const restWave = Math.sin(t * 0.74) * 0.035;
          const restBreath = (Math.sin(t * 1.12) + 1) * 0.5;
          if (bonesRef.current.leftShoulder) {
            bonesRef.current.leftShoulder.rotation.x = 0.12 + restBreath * 0.03;
            bonesRef.current.leftShoulder.rotation.y = 0.1;
            bonesRef.current.leftShoulder.rotation.z = -0.18 + restWave;
          }
          if (bonesRef.current.rightShoulder) {
            bonesRef.current.rightShoulder.rotation.x = 0.12 + restBreath * 0.03;
            bonesRef.current.rightShoulder.rotation.y = -0.1;
            bonesRef.current.rightShoulder.rotation.z = 0.18 - restWave;
          }
          if (bonesRef.current.leftArm) {
            bonesRef.current.leftArm.rotation.x = 0.08 + restBreath * 0.025;
            bonesRef.current.leftArm.rotation.y = 0.24;
            bonesRef.current.leftArm.rotation.z = -2.42 + restWave * 0.55;
          }
          if (bonesRef.current.rightArm) {
            bonesRef.current.rightArm.rotation.x = 0.08 + restBreath * 0.025;
            bonesRef.current.rightArm.rotation.y = -0.24;
            bonesRef.current.rightArm.rotation.z = 2.42 - restWave * 0.55;
          }
          if (bonesRef.current.leftForeArm) {
            bonesRef.current.leftForeArm.rotation.x = 0.05 + restBreath * 0.018;
            bonesRef.current.leftForeArm.rotation.y = 0.02;
            bonesRef.current.leftForeArm.rotation.z = -0.14 - restWave * 0.25;
          }
          if (bonesRef.current.rightForeArm) {
            bonesRef.current.rightForeArm.rotation.x = 0.05 + restBreath * 0.018;
            bonesRef.current.rightForeArm.rotation.y = -0.02;
            bonesRef.current.rightForeArm.rotation.z = 0.14 + restWave * 0.25;
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
        rightForeArm: null
      };
      boneBaseRef.current = {};
      mixerRef.current = null;
      motionActionsRef.current = new Map();
      clockRef.current = null;
    };
  }, [modelUrl]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !rendererRef.current || !cameraRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      rendererRef.current.setSize(rect.width, rect.height);
      cameraRef.current.aspect = rect.width / rect.height;
      cameraRef.current.updateProjectionMatrix();
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
