"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarLipsyncSequence, Mood } from "../avatar/AvatarEngine";

type Props = {
  className?: string;
  modelUrl?: string;
  mood: Mood;
  isTalking: boolean;
  talkIntensity?: number;
  isListening: boolean;
  lipsyncSequence?: AvatarLipsyncSequence | null;
  lipsyncStartTimeMs?: number;
  backgroundSrc?: string;
  avatarAppearance?: Record<string, unknown>;
};

type TalkingHeadInstance = {
  showAvatar: (avatar: Record<string, unknown>, onProgress?: ((event: ProgressEvent<EventTarget>) => void) | null, onPreprocess?: ((gltf: { scene?: { traverse?: (fn: (node: any) => void) => void } }) => void) | null) => Promise<void>;
  setMood: (mood: string) => void;
  stopSpeaking: () => void;
  getMorphTargetNames?: () => string[];
  getValue?: (target: string) => number | null | undefined;
  getFixedValue?: (target: string) => number | null | undefined;
  setFixedValue?: (target: string, value: number | null, ms?: number | null) => void;
  resetLips?: () => void;
  playGesture?: (name: string, dur?: number, mirror?: boolean, ms?: number) => void;
  playPose?: (name: string, onProgress?: unknown, dur?: number, ndx?: number, scale?: number) => Promise<void> | void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

const ACTIVE_VISEMES = ["PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U", "sil"] as const;
const ACTIVE_MOUTH_BLENDSHAPES = [
  "jawOpen",
  "mouthOpen",
  "mouthPucker",
  "mouthSmile",
  "mouthFunnel",
  "mouthClose",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthShrugUpper",
  "mouthRollLower"
] as const;
const LIP_BLEND_MS = 24;
const FACE_RESET_MS = 48;
const POSE_BLEND_MS = 90;

type AvatarAppearance = {
  preset: string;
  hairColor: string;
  skinColor: string;
  lipColor: string;
  outfitColor: string;
  accentColor: string;
  eyeGlow: number;
  matte: number;
  showJacket: boolean;
  showWrap: boolean;
  showGloves: boolean;
  showStockings: boolean;
  showBoots: boolean;
  showChoker: boolean;
};

const DEFAULT_APPEARANCE: AvatarAppearance = {
  preset: "goth_hostess",
  hairColor: "#09050a",
  skinColor: "#f3d9e2",
  lipColor: "#5b0c22",
  outfitColor: "#12070f",
  accentColor: "#5b1025",
  eyeGlow: 0.7,
  matte: 0.88,
  showJacket: false,
  showWrap: false,
  showGloves: false,
  showStockings: true,
  showBoots: true,
  showChoker: true
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAppearance(input: Record<string, unknown> | undefined): AvatarAppearance {
  const next = { ...DEFAULT_APPEARANCE, ...(input || {}) } as AvatarAppearance;
  next.eyeGlow = clamp(Number(next.eyeGlow ?? DEFAULT_APPEARANCE.eyeGlow), 0, 1);
  next.matte = clamp(Number(next.matte ?? DEFAULT_APPEARANCE.matte), 0.4, 1);
  next.showJacket = Boolean(next.showJacket);
  next.showWrap = Boolean(next.showWrap);
  next.showGloves = Boolean(next.showGloves);
  next.showStockings = Boolean(next.showStockings);
  next.showBoots = Boolean(next.showBoots);
  next.showChoker = Boolean(next.showChoker);
  return next;
}

function applyNocturneStyleToNode(node: any, appearance: AvatarAppearance) {
  if (!node?.isMesh || !node.material) return;
  const meshName = String(node.name || "").toLowerCase();
  const materialName = Array.isArray(node.material)
    ? node.material.map((m: any) => String(m?.name || "").toLowerCase()).join(" ")
    : String(node.material.name || "").toLowerCase();
  const label = `${meshName} ${materialName}`;
  const materials = Array.isArray(node.material) ? node.material : [node.material];

  if (meshName.includes("glasses") || label.includes("glasses-02") || label.includes("spectacles")) {
    node.visible = false;
    return;
  }

  if (meshName.startsWith("jacket")) node.visible = appearance.showJacket;
  if (meshName.startsWith("wrap")) node.visible = appearance.showWrap;
  if (meshName.startsWith("gloves")) node.visible = appearance.showGloves;
  if (meshName.startsWith("stockings")) node.visible = appearance.showStockings;
  if (meshName.startsWith("boots")) node.visible = appearance.showBoots;
  if (meshName.startsWith("choker_spikes")) node.visible = appearance.showChoker;

  for (const material of materials) {
    if (!material) continue;
    if ("roughness" in material) material.roughness = 0.75 + appearance.matte * 0.22;
    if ("metalness" in material) material.metalness = 0.02;
    if ("envMapIntensity" in material) material.envMapIntensity = 0.08 + (1 - appearance.matte) * 0.14;

    if (meshName.includes("wolf3d_hair") || label.includes("hair-53") || label.includes("hair")) {
      material.color?.set?.(appearance.hairColor);
      if ("roughness" in material) material.roughness = 0.8 + appearance.matte * 0.12;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.06;
    } else if (
      label.includes("std_skin_head") ||
      label.includes("std_skin_body") ||
      label.includes("std_skin_arm") ||
      label.includes("std_skin_leg")
    ) {
      material.color?.set?.(appearance.skinColor);
      if ("roughness" in material) material.roughness = 0.9 + appearance.matte * 0.08;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.03;
    } else if (label.includes("std_eye_l") || label.includes("std_eye_r") || label.includes("cornea")) {
      if ("roughness" in material) material.roughness = 0.12;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.18 + appearance.eyeGlow * 0.24;
    } else if (label.includes("eyebrow") || label.includes("eyelash")) {
      material.color?.set?.(appearance.hairColor);
    } else if (label.includes("std_lips") || label.includes("lip")) {
      material.color?.set?.(appearance.lipColor);
    } else if (
      meshName === "jacket" ||
      meshName === "top" ||
      meshName === "wrap" ||
      meshName === "gloves" ||
      meshName === "boots" ||
      meshName === "stockings" ||
      label.includes("jacket") ||
      label.includes("leather") ||
      label.includes("gloves") ||
      label.includes("pantyhose") ||
      label.includes("boots") ||
      label.includes("top")
    ) {
      const tint = (meshName === "wrap" || label.includes("metal") || label.includes("piercing") || label.includes("choker"))
        ? appearance.accentColor
        : appearance.outfitColor;
      material.color?.set?.(tint);
      if ("roughness" in material) material.roughness = meshName === "stockings" ? 0.56 : 0.86 + appearance.matte * 0.1;
      if ("metalness" in material) material.metalness = label.includes("metal") || label.includes("piercing") ? 0.34 : 0.03;
      if ("transparent" in material && meshName === "stockings") material.transparent = true;
      if ("opacity" in material && meshName === "stockings") material.opacity = appearance.showStockings ? 0.86 : 0;
    } else if (meshName.includes("wolf3d_outfit_top") || (label.includes("outfit") && label.includes("top"))) {
      material.map = null;
      material.normalMap = null;
      material.color?.set?.("#0c070d");
      if ("roughness" in material) material.roughness = 0.98;
      if ("metalness" in material) material.metalness = 0.01;
    } else if (meshName.includes("wolf3d_outfit_bottom") || (label.includes("outfit") && label.includes("bottom"))) {
      material.map = null;
      material.normalMap = null;
      material.color?.set?.("#0b060b");
      if ("roughness" in material) material.roughness = 0.99;
    } else if (meshName.includes("wolf3d_outfit_footwear") || label.includes("footwear") || label.includes("shoe")) {
      material.map = null;
      material.normalMap = null;
      material.color?.set?.("#070508");
      if ("roughness" in material) material.roughness = 0.9;
    } else if (meshName.includes("wolf3d_head") || meshName.includes("wolf3d_body") || label.includes("face") || label.includes("head") || label.includes("body")) {
      material.color?.offsetHSL?.(0.01, -0.2, 0.18);
      if ("roughness" in material) material.roughness = 0.88;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.28;
    } else if (meshName.includes("wolf3d_eye") || label.includes("eye")) {
      if ("roughness" in material) material.roughness = 0.28;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.52;
    } else if (meshName.startsWith("avaturn_hair_")) {
      material.map = null;
      material.normalMap = null;
      material.color?.set?.("#080408");
      if ("roughness" in material) material.roughness = 0.74;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.16;
    } else if (meshName.startsWith("avaturn_look_")) {
      material.map = null;
      material.normalMap = null;
      material.color?.set?.("#120a12");
      if ("roughness" in material) material.roughness = 0.99;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.1;
    } else if (meshName.startsWith("avaturn_shoes_")) {
      material.map = null;
      material.normalMap = null;
      material.color?.set?.("#080508");
      if ("roughness" in material) material.roughness = 0.92;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.1;
    } else if (label.includes("hair")) {
      material.map = null;
      material.color?.set?.("#080408");
    } else if (label.includes("eyebrow") || meshName.includes("eyelash")) {
      material.color?.set?.("#14080b");
    } else if (label.includes("shirt") || label.includes("dress") || label.includes("skirt") || label.includes("shoe") || label.includes("sneaker")) {
      material.color?.set?.("#120a12");
    } else if (label.includes("jean") || label.includes("denim")) {
      material.color?.set?.("#1a1016");
    } else if (meshName === "head_mesh" || meshName === "body_mesh" || label.includes("skin") || label.includes("body") || label.includes("head") || label.includes("face")) {
      material.color?.offsetHSL?.(0.01, -0.16, 0.14);
      if ("roughness" in material) material.roughness = 0.9;
      if ("envMapIntensity" in material) material.envMapIntensity = 0.28;
    } else if (label.includes("teeth")) {
      material.color?.set?.("#f3e8ea");
    } else if (label.includes("tongue")) {
      material.color?.set?.("#7b3d53");
    }

    material.needsUpdate = true;
  }
}

function clearTalkingHeadFace(head: TalkingHeadInstance | null) {
  if (!head) return;
  head.stopSpeaking();
  head.resetLips?.();
  for (const viseme of ACTIVE_VISEMES) {
    head.setFixedValue?.(`viseme_${viseme}`, 0, FACE_RESET_MS);
  }
  for (const mt of ACTIVE_MOUTH_BLENDSHAPES) {
    head.setFixedValue?.(mt, 0, FACE_RESET_MS);
  }
  head.setFixedValue?.("bodyRotateY", 0, POSE_BLEND_MS);
  head.setFixedValue?.("headRotateY", 0, POSE_BLEND_MS);
  head.setFixedValue?.("headRotateX", 0, POSE_BLEND_MS);
}

function collectMeshAudit(armature: any) {
  const rows: Array<{ name: string; visible: boolean; material: string }> = [];
  try {
    armature?.traverse?.((node: any) => {
      if (!node?.isMesh) return;
      rows.push({
        name: String(node.name || ""),
        visible: Boolean(node.visible !== false),
        material: Array.isArray(node.material)
          ? node.material.map((m: any) => String(m?.name || "")).join(",")
          : String(node.material?.name || "")
      });
    });
  } catch {
    return rows;
  }
  return rows;
}

function ensureLenoreRuntimeCompatibility(head: any) {
  const mtAvatar = head?.mtAvatar;
  if (!mtAvatar || typeof mtAvatar !== "object") return;
  const fallbackKeys = [
    "eyeLookInLeft",
    "eyeLookOutLeft",
    "eyeLookInRight",
    "eyeLookOutRight"
  ];
  for (const key of fallbackKeys) {
    if (!mtAvatar[key]) {
      mtAvatar[key] = {
        name: key,
        value: 0,
        target: 0,
        default: 0,
        baseline: 0,
        base: 0,
        fixed: null,
        system: 0,
        systemd: 0,
        needsUpdate: false,
        easing: head?.mtEasingDefault || null,
        min: 0,
        max: 1,
        v: 0
      };
    }
  }
  if (Array.isArray(head.mtRandomized)) {
    const filtered = head.mtRandomized.filter((key: string) => Boolean(mtAvatar[key]));
    head.mtRandomized = filtered.length ? filtered : ["eyesLookDown"];
  }
}

function mapMood(mood: Mood, isListening: boolean, isTalking: boolean): string {
  if (isTalking) {
    if (mood === "teasing") return "love";
    if (mood === "happy") return "happy";
    if (mood === "surprised") return "happy";
  }
  if (isListening && mood === "concerned") return "fear";
  switch (mood) {
    case "happy":
      return "happy";
    case "teasing":
      return "love";
    case "thinking":
      return "sad";
    case "concerned":
      return "fear";
    case "surprised":
      return "happy";
    default:
      return isListening ? "happy" : "neutral";
  }
}

function phonemeToOvrViseme(phoneme?: string): string {
  const key = String(phoneme || "").toLowerCase().trim();
  if (!key) return "sil";
  if (["m", "b", "p"].includes(key)) return "PP";
  if (["f", "v"].includes(key)) return "FF";
  if (key === "th") return "TH";
  if (["d", "t"].includes(key)) return "DD";
  if (["k", "g", "c", "q"].includes(key)) return "kk";
  if (["ch", "j", "sh"].includes(key)) return "CH";
  if (["s", "z"].includes(key)) return "SS";
  if (["n", "l"].includes(key)) return "nn";
  if (key === "r") return "RR";
  if (["a", "h"].includes(key)) return "aa";
  if (key === "e") return "E";
  if (["i", "y"].includes(key)) return "I";
  if (key === "o") return "O";
  if (["u", "w"].includes(key)) return "U";
  return "sil";
}

function buildRawVisemeTrack(sequence: AvatarLipsyncSequence | null | undefined, startedAtMs: number, nowMs: number) {
  if (!sequence?.sequences?.length || !startedAtMs) return null;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const remaining = sequence.sequences
    .filter((cue) => cue.time + cue.duration > elapsedMs)
    .map((cue) => {
      const adjustedStart = Math.max(0, cue.time - elapsedMs);
      return {
        viseme: phonemeToOvrViseme(cue.phoneme),
        time: adjustedStart,
        duration: cue.duration
      };
    });

  if (!remaining.length) return null;
  return {
    visemes: remaining.map((cue) => cue.viseme),
    vtimes: remaining.map((cue) => cue.time),
    vdurations: remaining.map((cue) => Math.max(50, cue.duration))
  };
}

export default function TalkingHeadAvatar({
  className,
  modelUrl,
  mood,
  isTalking,
  talkIntensity = 0.5,
  isListening,
  lipsyncSequence,
  lipsyncStartTimeMs = 0,
  backgroundSrc,
  avatarAppearance
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<TalkingHeadInstance | null>(null);
  const lastSpeechKeyRef = useRef("");
  const listeningGestureRef = useRef(false);
  const speechRafRef = useRef<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadProgress, setLoadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const supportedMorphsRef = useRef<Set<string>>(new Set());
  const meshAuditRef = useRef<Array<{ name: string; visible: boolean; material: string }>>([]);

  const resolvedMood = useMemo(
    () => mapMood(mood, isListening, isTalking),
    [mood, isListening, isTalking]
  );
  const appearance = useMemo(
    () => normalizeAppearance(avatarAppearance),
    [avatarAppearance]
  );
  const isNocturneStage = /avaturn|aika-base|nocturne|lenore/i.test(String(modelUrl || ""));
  const isLenoreModel = /lenore/i.test(String(modelUrl || ""));

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!hostRef.current || !modelUrl) return;
      setLoadError("");
      setIsReady(false);
      setLoadProgress(0);
      try {
        const { TalkingHead } = await import("@met4citizen/talkinghead");
        if (cancelled || !hostRef.current) return;
        const head = new TalkingHead(hostRef.current, {
          lipsyncModules: [],
          cameraView: "upper",
          cameraDistance: isLenoreModel ? -0.34 : -0.18,
          cameraX: isLenoreModel ? 0.0 : 0.01,
          cameraY: isLenoreModel ? -0.22 : -0.04,
          cameraRotateEnable: false,
          cameraPanEnable: false,
          cameraZoomEnable: false,
          modelPixelRatio: Math.min(1.4, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
          lightAmbientColor: isLenoreModel ? "#d7c2ca" : "#c9b3bc",
          lightAmbientIntensity: isLenoreModel ? 0.72 : 0.54,
          lightDirectColor: isLenoreModel ? "#e4ccd4" : "#f1d2da",
          lightDirectIntensity: isLenoreModel ? 5.1 : 4.8,
          lightDirectPhi: 0.82,
          lightDirectTheta: 2.56,
          lightSpotColor: "#4a081b",
          lightSpotIntensity: isLenoreModel ? 1.2 : 3.2,
          lightSpotPhi: 0.22,
          lightSpotTheta: 4.08,
          lightSpotDispersion: 1.04,
          avatarMood: resolvedMood,
          avatarIdleEyeContact: isLenoreModel ? 0 : 0.42,
          avatarIdleHeadMove: 0.46,
          avatarSpeakingEyeContact: isLenoreModel ? 0 : 0.76,
          avatarSpeakingHeadMove: 0.68,
          listeningSilenceThresholdLevel: 32,
          listeningSilenceThresholdMs: 1600
        });

        const preprocess = (gltf: { scene?: { traverse?: (fn: (node: any) => void) => void } }) => {
          meshAuditRef.current = [];
          gltf?.scene?.traverse?.((node: any) => {
            if (!node?.isMesh) return;
            applyNocturneStyleToNode(node, appearance);
            meshAuditRef.current.push({
              name: String(node.name || ""),
              visible: Boolean(node.visible !== false),
              material: Array.isArray(node.material)
                ? node.material.map((m: any) => String(m?.name || "")).join(",")
                : String(node.material?.name || "")
            });
          });
        };

        await head.showAvatar(
          {
            url: modelUrl,
            body: "F",
            avatarMood: resolvedMood,
            avatarMute: true,
            avatarIdleEyeContact: 0.42,
            avatarIdleHeadMove: 0.46,
            avatarSpeakingEyeContact: 0.76,
            avatarSpeakingHeadMove: 0.68,
            baseline: {
              headRotateX: -0.02,
              eyeBlinkLeft: 0.08,
              eyeBlinkRight: 0.08,
              jawOpen: 0,
              mouthOpen: 0,
              mouthPucker: 0,
              mouthClose: 0,
              mouthSmile: resolvedMood === "love" ? 0.04 : 0
            }
          },
          (event) => {
            if (cancelled) return;
            if (event.lengthComputable && event.total > 0) {
              setLoadProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
            }
          },
          preprocess
        );

        if (cancelled) {
          head.dispose();
          return;
        }

        headRef.current = head;
        if (isLenoreModel) ensureLenoreRuntimeCompatibility(head as any);
        supportedMorphsRef.current = new Set(head.getMorphTargetNames?.() || []);
        meshAuditRef.current = [];
        try {
          (head as any).armature?.traverse?.((node: any) => {
            if (!node?.isMesh) return;
            applyNocturneStyleToNode(node, appearance);
          });
          meshAuditRef.current = collectMeshAudit((head as any).armature);
        } catch {
          // ignore audit failures
        }
        if (typeof window !== "undefined") {
          (window as any).__AIKA_TALKINGHEAD_INSTANCE = head;
          (window as any).__AIKA_TALKINGHEAD_DEBUG = {
            getMorphTargetNames: () => Array.from(supportedMorphsRef.current.values()).sort(),
            getMeshAudit: () => meshAuditRef.current,
            getCurrentTargets: () => ({
              jawOpen: head.getValue?.("jawOpen") ?? null,
              mouthOpen: head.getValue?.("mouthOpen") ?? null,
              mouthPucker: head.getValue?.("mouthPucker") ?? null,
              mouthClose: head.getValue?.("mouthClose") ?? null,
              viseme_aa: head.getValue?.("viseme_aa") ?? null,
              viseme_sil: head.getValue?.("viseme_sil") ?? null
            }),
            setTarget: (name: string, value: number) => head.setFixedValue?.(name, value),
            clear: () => clearTalkingHeadFace(head)
          };
        }
        head.start();
        clearTalkingHeadFace(head);
        try {
          await head.playPose?.("straight", null, 8);
        } catch {
          // Non-fatal. Built-in idle pose loop still runs.
        }
        setIsReady(true);
      } catch (error: any) {
        if (cancelled) return;
        setLoadError(error?.message || "3d_avatar_load_failed");
      }
    }

    init();
    return () => {
      cancelled = true;
      clearTalkingHeadFace(headRef.current);
      headRef.current?.dispose?.();
      headRef.current = null;
      supportedMorphsRef.current = new Set();
      if (typeof window !== "undefined") {
        delete (window as any).__AIKA_TALKINGHEAD_INSTANCE;
        delete (window as any).__AIKA_TALKINGHEAD_DEBUG;
      }
      lastSpeechKeyRef.current = "";
      listeningGestureRef.current = false;
      if (speechRafRef.current != null) cancelAnimationFrame(speechRafRef.current);
      speechRafRef.current = null;
    };
  }, [modelUrl, isLenoreModel]);

  useEffect(() => {
    const head = headRef.current as any;
    if (!head?.armature) return;
    try {
      head.armature.traverse((node: any) => {
        if (!node?.isMesh) return;
        applyNocturneStyleToNode(node, appearance);
      });
      meshAuditRef.current = collectMeshAudit(head.armature);
    } catch {
      // ignore runtime style reapply failures
    }
  }, [appearance]);

  useEffect(() => {
    headRef.current?.setMood?.(resolvedMood);
  }, [resolvedMood]);

  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    if (isListening && !listeningGestureRef.current && !isTalking) {
      listeningGestureRef.current = true;
      try {
        head.playPose?.("straight", null, 6);
      } catch {
        // Ignore pose failures.
      }
      return;
    }
    if (!isListening) {
      listeningGestureRef.current = false;
    }
  }, [isListening, isTalking]);

  useEffect(() => {
    const head = headRef.current;
    if (!head || !isReady) return;
    const clearSpeechState = () => {
      if (speechRafRef.current != null) cancelAnimationFrame(speechRafRef.current);
      speechRafRef.current = null;
      clearTalkingHeadFace(head);
      lastSpeechKeyRef.current = "";
    };

    if (!isTalking) {
      clearSpeechState();
      return;
    }
    if (!lipsyncSequence?.sequences?.length || !lipsyncStartTimeMs) return;
    const speechKey = `${lipsyncStartTimeMs}:${lipsyncSequence.totalDuration}:${lipsyncSequence.sequences.length}`;
    if (speechKey === lastSpeechKeyRef.current) return;
    lastSpeechKeyRef.current = speechKey;

        const animateSpeech = () => {
      const now = performance.now();
      const elapsed = Math.max(0, now - lipsyncStartTimeMs);
      if (!lipsyncSequence?.sequences?.length || elapsed > lipsyncSequence.totalDuration + 120) {
        clearSpeechState();
        return;
      }

      const currentIndex = lipsyncSequence.sequences.findIndex(
        (cue) => elapsed >= cue.time && elapsed < cue.time + cue.duration
      );
      const cue = currentIndex >= 0 ? lipsyncSequence.sequences[currentIndex] : null;

      for (const viseme of ACTIVE_VISEMES) {
        head.setFixedValue?.(`viseme_${viseme}`, 0, LIP_BLEND_MS);
      }
      for (const mt of ACTIVE_MOUTH_BLENDSHAPES) {
        head.setFixedValue?.(mt, 0, LIP_BLEND_MS);
      }

      if (cue) {
        const activeViseme = phonemeToOvrViseme(cue.phoneme);
        const progress = cue.duration > 0 ? Math.max(0, Math.min(1, (elapsed - cue.time) / cue.duration)) : 0;
        const activeWeight = 0.72 + Math.sin(progress * Math.PI) * 0.14;
        head.setFixedValue?.(`viseme_${activeViseme}`, activeWeight, LIP_BLEND_MS);
        const shape = cue.blendshapes || {};
        const cueCurve = 0.72 + Math.sin(progress * Math.PI) * 0.18;
        const isRounded = activeViseme === "O" || activeViseme === "U";
        const isWide = activeViseme === "E" || activeViseme === "I";
        const isClosed = activeViseme === "PP" || activeViseme === "FF";
        const isOpen = activeViseme === "aa";
        const jawOpen = Math.min(0.82, ((shape.jawOpen || 0) * 2.35 + (isOpen ? 0.18 : 0) + (isWide ? 0.08 : 0)) * cueCurve);
        const mouthOpen = Math.min(0.42, ((shape.mouthOpen || 0) * 1.95 + (isOpen ? 0.12 : 0) + (isWide ? 0.16 : 0)) * cueCurve);
        const mouthPucker = Math.min(0.46, (shape.mouthPucker || 0) * 0.82 + (isRounded ? 0.18 : 0));
        const mouthSmile = Math.min(0.32, (isWide ? 0.12 : 0) + ((resolvedMood === "happy" || resolvedMood === "love") ? 0.06 : 0));
        const mouthFunnel = Math.min(0.42, (isRounded ? 0.24 : 0) + (shape.mouthPucker || 0) * 0.35);
        const mouthClose = Math.min(0.84, isClosed ? 0.72 : 0.02);
        const mouthPress = Math.min(0.28, isClosed ? 0.18 : 0);
        const mouthShrugUpper = Math.min(0.18, activeViseme === "FF" ? 0.14 : 0);
        const mouthRollLower = Math.min(0.16, activeViseme === "FF" ? 0.12 : 0);

        head.setFixedValue?.("jawOpen", jawOpen, LIP_BLEND_MS);
        head.setFixedValue?.("mouthOpen", mouthOpen, LIP_BLEND_MS);
        head.setFixedValue?.("mouthPucker", mouthPucker, LIP_BLEND_MS);
        head.setFixedValue?.("mouthSmile", mouthSmile, LIP_BLEND_MS);
        head.setFixedValue?.("mouthFunnel", mouthFunnel, LIP_BLEND_MS);
        head.setFixedValue?.("mouthClose", mouthClose, LIP_BLEND_MS);
        head.setFixedValue?.("mouthPressLeft", mouthPress, LIP_BLEND_MS);
        head.setFixedValue?.("mouthPressRight", mouthPress, LIP_BLEND_MS);
        head.setFixedValue?.("mouthShrugUpper", mouthShrugUpper, LIP_BLEND_MS);
        head.setFixedValue?.("mouthRollLower", mouthRollLower, LIP_BLEND_MS);
        head.setFixedValue?.("viseme_sil", 0, LIP_BLEND_MS);

        const sway = Math.sin(elapsed / 240) * (0.01 + talkIntensity * 0.012);
        const nod = Math.sin(elapsed / 320) * (0.007 + talkIntensity * 0.01);
        head.setFixedValue?.("bodyRotateY", sway, POSE_BLEND_MS);
        head.setFixedValue?.("headRotateY", sway * 1.8, POSE_BLEND_MS);
        head.setFixedValue?.("headRotateX", nod, POSE_BLEND_MS);
      }

      speechRafRef.current = requestAnimationFrame(animateSpeech);
    };

    clearSpeechState();
    speechRafRef.current = requestAnimationFrame(animateSpeech);
    return clearSpeechState;
  }, [isReady, isTalking, talkIntensity, lipsyncSequence, lipsyncStartTimeMs, resolvedMood]);

  useEffect(() => {
    const head = headRef.current;
    if (!head || !isReady || !isTalking || lipsyncSequence?.sequences?.length) return;
    let raf: number | null = null;
    let startedAt = performance.now();
    const tick = () => {
      const t = performance.now();
      if (t - startedAt < 220) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const pulse = (Math.sin(t / 140) + 1) * 0.5;
      const sway = Math.sin(t / 240) * (0.008 + talkIntensity * 0.01);
      head.setFixedValue?.("jawOpen", 0.014 + pulse * (0.024 + talkIntensity * 0.032), LIP_BLEND_MS);
      head.setFixedValue?.("mouthOpen", 0.01 + pulse * (0.018 + talkIntensity * 0.026), LIP_BLEND_MS);
      head.setFixedValue?.("mouthSmile", resolvedMood === "happy" || resolvedMood === "love" ? 0.08 : 0.008, LIP_BLEND_MS);
      head.setFixedValue?.("mouthPucker", 0.006 + pulse * 0.01, LIP_BLEND_MS);
      head.setFixedValue?.("bodyRotateY", sway, POSE_BLEND_MS);
      head.setFixedValue?.("headRotateY", sway * 1.6, POSE_BLEND_MS);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      clearTalkingHeadFace(head);
    };
  }, [isReady, isTalking, talkIntensity, lipsyncSequence, resolvedMood]);

  useEffect(() => {
    const onVisibility = () => {
      const head = headRef.current;
      if (!head) return;
      if (document.visibilityState === "visible") head.start();
      else head.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
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
            "radial-gradient(circle at 50% 18%, rgba(255,230,238,0.16), transparent 20%), radial-gradient(circle at 50% 65%, rgba(84,16,34,0.34), transparent 42%), linear-gradient(180deg, #13060d 0%, #230712 42%, #09060b 100%)",
          boxShadow: "inset 0 0 140px rgba(0,0,0,0.62), 0 26px 80px rgba(0,0,0,0.48)",
          zIndex: 0
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "2% auto 2% 0",
          width: "12%",
          borderTopLeftRadius: 24,
          borderBottomLeftRadius: 24,
          background: "linear-gradient(180deg, rgba(63,7,26,0.96), rgba(21,5,12,0.98))",
          boxShadow: "inset -10px 0 18px rgba(255,173,198,0.08), inset -28px 0 40px rgba(0,0,0,0.4)",
          zIndex: 0
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "2% 0 2% auto",
          width: "12%",
          borderTopRightRadius: 24,
          borderBottomRightRadius: 24,
          background: "linear-gradient(180deg, rgba(63,7,26,0.96), rgba(21,5,12,0.98))",
          boxShadow: "inset 10px 0 18px rgba(255,173,198,0.08), inset 28px 0 40px rgba(0,0,0,0.4)",
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
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 24,
              zIndex: 0,
              opacity: 0.9
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              backgroundImage: `url(${backgroundSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              zIndex: 0,
              opacity: 0.9
            }}
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
          background:
            "radial-gradient(circle at 50% 18%, rgba(255, 228, 237, 0.24), transparent 24%), linear-gradient(180deg, rgba(30, 10, 18, 0.94), rgba(8, 6, 12, 0.98))",
          outline: "1px solid rgba(255, 204, 220, 0.12)",
          boxShadow: "inset 0 0 44px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.03)",
          zIndex: 1
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "2.5% 6.5% 3.5% 6.5%",
          borderRadius: 24,
          background: "radial-gradient(circle at 50% 28%, transparent 0%, transparent 48%, rgba(0,0,0,0.16) 72%, rgba(0,0,0,0.42) 100%)",
          pointerEvents: "none",
          zIndex: 2
        }}
      />
      {isNocturneStage && (
        <>
          <div
            style={{
              position: "absolute",
              inset: "2.5% 6.5% 3.5% 6.5%",
              borderRadius: 24,
              background: "radial-gradient(circle at 50% 12%, rgba(255,229,236,0.12), transparent 22%), radial-gradient(circle at 50% 78%, rgba(0,0,0,0.18), transparent 34%)",
              pointerEvents: "none",
              zIndex: 2
            }}
          />
        </>
      )}
      {!isReady && !loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f5e8eb",
            zIndex: 2,
            fontSize: 14,
            letterSpacing: "0.04em",
            background: "rgba(8, 6, 12, 0.42)"
          }}
        >
          Loading 3D avatar{loadProgress > 0 ? ` ${loadProgress}%` : "..."}
        </div>
      )}
      {loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffd6df",
            zIndex: 2,
            fontSize: 13,
            padding: 16,
            textAlign: "center",
            background: "rgba(24, 8, 14, 0.88)"
          }}
        >
          {loadError}
        </div>
      )}
    </div>
  );
}
