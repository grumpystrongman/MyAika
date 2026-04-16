"use client";

import { useEffect, useMemo, useState } from "react";
import type { AvatarLipsyncCue, AvatarLipsyncSequence, Mood } from "../avatar/AvatarEngine";

type StageConfig = {
  baseImage: string;
  layers: {
    bodyShell?: string;
    faceShell?: string;
    hairBack?: string;
    hairFront?: string;
    eyeZone?: string;
    mouthCore?: string;
  };
  variants?: {
    browLift?: string;
    browKnit?: string;
    eyeGloss?: string;
    mouthSoft?: string;
    mouthMedium?: string;
    mouthWide?: string;
    mouthRound?: string;
    mouthClosedPress?: string;
    mouthLipBite?: string;
    mouthEe?: string;
    mouthAh?: string;
    mouthOh?: string;
    mouthSibilant?: string;
    mouthTongue?: string;
  };
  frame?: {
    scale?: number;
    offsetX?: number;
    offsetY?: number;
  };
  anchors: {
    leftEye: { x: number; y: number; w: number; h: number };
    rightEye: { x: number; y: number; w: number; h: number };
  };
};

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
};

const DEFAULT_CONFIG: StageConfig = {
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
    leftEye: { x: 0.318, y: 0.215, w: 0.112, h: 0.04 },
    rightEye: { x: 0.565, y: 0.215, w: 0.112, h: 0.04 }
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pickActiveCue(sequence: AvatarLipsyncSequence | null | undefined, startedAtMs: number, nowMs: number): AvatarLipsyncCue | null {
  if (!sequence?.sequences?.length || !startedAtMs) return null;
  const elapsed = nowMs - startedAtMs;
  if (elapsed < 0 || elapsed > sequence.totalDuration + 140) return null;
  return sequence.sequences.find((cue) => elapsed >= cue.time && elapsed < cue.time + cue.duration) || null;
}

function selectMouthKey(cue: AvatarLipsyncCue | null, fallbackOpen: number) {
  const phoneme = String(cue?.phoneme || "").toLowerCase();
  if (["m", "b", "p"].includes(phoneme)) return "mouthClosedPress";
  if (["f", "v"].includes(phoneme)) return "mouthLipBite";
  if (["th", "l"].includes(phoneme)) return "mouthTongue";
  if (["s", "z", "t", "d", "n", "sh", "ch", "j"].includes(phoneme)) return "mouthSibilant";
  if (["e", "i", "y"].includes(phoneme)) return "mouthEe";
  if (["a", "h"].includes(phoneme)) return "mouthAh";
  if (["o", "u", "w", "r"].includes(phoneme)) return "mouthOh";
  if (fallbackOpen > 0.72) return "mouthWide";
  if (fallbackOpen > 0.55) return "mouthAh";
  if (fallbackOpen > 0.36) return "mouthMedium";
  if (fallbackOpen > 0.18) return "mouthSoft";
  return "mouthSoft";
}

function moodProfile(mood: Mood) {
  switch (mood) {
    case "happy":
      return { warmth: 1, knit: 0, lift: 0.26, hue: "rgba(180,42,58,0.14)" };
    case "teasing":
      return { warmth: 0.72, knit: 0.06, lift: 0.42, hue: "rgba(120,14,44,0.16)" };
    case "thinking":
      return { warmth: 0.18, knit: 0.18, lift: 0.08, hue: "rgba(50,72,126,0.1)" };
    case "concerned":
      return { warmth: 0.1, knit: 0.4, lift: 0.04, hue: "rgba(68,34,54,0.18)" };
    case "surprised":
      return { warmth: 0.4, knit: 0, lift: 0.7, hue: "rgba(178,122,144,0.14)" };
    default:
      return { warmth: 0.28, knit: 0.08, lift: 0.1, hue: "rgba(88,18,38,0.12)" };
  }
}

function layerStyle(transform: string, opacity = 1, filter = "") {
  return {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    transform,
    opacity,
    filter,
    pointerEvents: "none" as const,
    userSelect: "none" as const
  };
}

export default function LayeredStageAvatar({
  className,
  modelUrl,
  mood,
  isTalking,
  talkIntensity = 0.5,
  isListening,
  lipsyncSequence,
  lipsyncStartTimeMs = 0,
  backgroundSrc
}: Props) {
  const [config, setConfig] = useState<StageConfig>(DEFAULT_CONFIG);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNowMs(Date.now());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      if (!modelUrl || !modelUrl.toLowerCase().endsWith(".json")) {
        setConfig(DEFAULT_CONFIG);
        return;
      }
      try {
        const response = await fetch(modelUrl);
        if (!response.ok) throw new Error("stage_config_load_failed");
        const next = await response.json();
        if (!active) return;
        setConfig({
          ...DEFAULT_CONFIG,
          ...next,
          layers: { ...DEFAULT_CONFIG.layers, ...(next.layers || {}) },
          variants: { ...DEFAULT_CONFIG.variants, ...(next.variants || {}) },
          frame: { ...DEFAULT_CONFIG.frame, ...(next.frame || {}) },
          anchors: { ...DEFAULT_CONFIG.anchors, ...(next.anchors || {}) }
        });
      } catch {
        if (active) setConfig(DEFAULT_CONFIG);
      }
    }
    loadConfig();
    return () => {
      active = false;
    };
  }, [modelUrl]);

  const cue = useMemo(
    () => pickActiveCue(lipsyncSequence || null, lipsyncStartTimeMs, nowMs),
    [lipsyncSequence, lipsyncStartTimeMs, nowMs]
  );

  const motion = useMemo(() => {
    const t = nowMs * 0.001;
    const profile = moodProfile(mood);
    const syntheticOpen = isTalking
      ? clamp(0.16 + talkIntensity * 0.54 + Math.sin(t * 9.6) * 0.12, 0.05, 0.92)
      : 0;
    const cueOpen = cue
      ? clamp(
        (cue.blendshapes?.jawOpen || 0) * 0.9 +
        (cue.blendshapes?.mouthOpen || 0) * 0.75 +
        (cue.blendshapes?.mouthPucker || 0) * 0.18,
        0,
        1
      )
      : syntheticOpen;
    const bodySway = Math.sin(t * 0.9) * 10 + (isListening ? -4 : 0);
    const bodyLift = Math.sin(t * 1.8) * 6 - (isTalking ? 3 : 0) - (isListening ? 7 : 0);
    const headTilt = Math.sin(t * 0.75) * 1.25 + (isListening ? -1.2 : 0) + (mood === "teasing" ? 1.5 : 0);
    const gazeX = Math.sin(t * 0.62) * (isListening ? 10 : 7) + (mood === "thinking" ? -4 : 0);
    const gazeY = Math.cos(t * 0.81) * 3 - (isListening ? 2 : 0);
    const breath = Math.sin(t * 1.55) * 0.5 + 0.5;
    const talkBounce = isTalking ? Math.sin(t * 7.8) * 5 : 0;
    const listenLean = isListening ? -10 : 0;
    const shoulderRoll = Math.sin(t * 0.84) * 1.8 + (isListening ? -1.4 : 0);
    const haloPulse = 0.72 + (isTalking ? Math.sin(t * 6.4) * 0.18 : 0) + (isListening ? 0.08 : 0);
    const curtainShift = Math.sin(t * 0.24) * 16;
    const blink = 1 - Math.pow(Math.abs(Math.sin(t * 0.28 + 0.7)), 42);
    const blinkSoft = clamp(blink * 1.25, 0, 1);
    const mouthKey = selectMouthKey(cue, cueOpen);

    return {
      cueOpen,
      mouthKey,
      bodySway,
      bodyLift,
      headTilt,
      gazeX,
      gazeY,
      breath,
      talkBounce,
      listenLean,
      shoulderRoll,
      haloPulse,
      curtainShift,
      blinkSoft,
      browLift: clamp(profile.lift + (isListening ? 0.22 : 0) + (mood === "surprised" ? 0.18 : 0), 0, 1),
      browKnit: clamp(profile.knit + (mood === "thinking" ? 0.08 : 0), 0, 1),
      warmth: profile.warmth,
      hue: profile.hue,
      scale: (config.frame?.scale || 0.98) + breath * 0.012 + (isTalking ? 0.02 : 0) + (isListening ? 0.014 : 0)
    };
  }, [config.frame, cue, isListening, isTalking, mood, nowMs, talkIntensity]);

  const mouthSrc = config.variants?.[motion.mouthKey as keyof NonNullable<StageConfig["variants"]>] || config.variants?.mouthSoft;
  const figureTransform = `translate3d(${config.frame?.offsetX || 0}%, ${((config.frame?.offsetY || 0) * 100).toFixed(2)}%, 0) scale(${motion.scale})`;
  const eyes = [config.anchors.leftEye, config.anchors.rightEye];

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: 28,
        background:
          "radial-gradient(circle at 50% 18%, rgba(255,228,232,0.1), transparent 20%), radial-gradient(circle at 50% 72%, rgba(154,12,54,0.16), transparent 34%), linear-gradient(180deg, #150d12 0%, #09070d 62%, #08060a 100%)",
        boxShadow: "inset 0 0 0 1px rgba(242,196,205,0.1), inset 0 40px 80px rgba(255,255,255,0.02)",
        isolation: "isolate"
      }}
    >
      {backgroundSrc && (
        /\.(mp4|webm|ogg)$/i.test(backgroundSrc) ? (
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
              opacity: 0.18,
              filter: "blur(6px) saturate(0.9)",
              pointerEvents: "none"
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${backgroundSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.18,
              filter: "blur(6px) saturate(0.9)"
            }}
          />
        )
      )}

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(18,10,14,0.92) 0%, rgba(18,10,14,0.08) 14%, rgba(18,10,14,0.08) 86%, rgba(18,10,14,0.92) 100%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: "-8%", top: "-4%", width: "30%", height: "120%", background: "linear-gradient(180deg, rgba(52,9,20,0.86), rgba(10,6,10,0.08) 40%, rgba(52,9,20,0.7) 100%)", filter: "blur(1px)", transform: `translateX(${motion.curtainShift * -0.45}px)` }} />
      <div style={{ position: "absolute", right: "-8%", top: "-4%", width: "30%", height: "120%", background: "linear-gradient(180deg, rgba(52,9,20,0.86), rgba(10,6,10,0.08) 40%, rgba(52,9,20,0.7) 100%)", filter: "blur(1px)", transform: `translateX(${motion.curtainShift * 0.45}px)` }} />
      <div style={{ position: "absolute", inset: "auto 10% 3% 10%", height: "14%", background: "radial-gradient(circle at center, rgba(132,12,38,0.32), rgba(132,12,38,0.06) 48%, transparent 70%)", filter: "blur(14px)", transform: `scale(${1 + motion.cueOpen * 0.08 + motion.breath * 0.04})` }} />
      <div style={{ position: "absolute", left: "11%", bottom: "18%", width: "12%", height: "18%", borderRadius: "999px", background: "radial-gradient(circle at 50% 86%, rgba(246,168,98,0.72), rgba(160,42,18,0.18) 40%, transparent 72%)", filter: "blur(18px)", opacity: 0.8 }} />
      <div style={{ position: "absolute", right: "12%", bottom: "21%", width: "8%", height: "13%", borderRadius: "999px", background: "radial-gradient(circle at 50% 86%, rgba(246,168,98,0.56), rgba(160,42,18,0.12) 40%, transparent 72%)", filter: "blur(16px)", opacity: 0.64 }} />
      <div style={{ position: "absolute", inset: "10% 16% 20% 16%", background: "radial-gradient(circle at 50% 30%, rgba(255,210,220,0.14), rgba(160,22,54,0.08) 44%, transparent 74%)", filter: "blur(28px)", opacity: motion.haloPulse, transform: `scale(${1 + motion.breath * 0.06 + motion.cueOpen * 0.05})` }} />
      <div style={{ position: "absolute", inset: "4% 8% 4% 8%", transform: figureTransform, pointerEvents: "none" }}>
        <img src={config.baseImage} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.12}px, ${motion.bodyLift * 0.12}px, 0) scale(1.03)`, 0.16, "blur(18px) saturate(0.92)")} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 22%, rgba(255,238,240,0.09), transparent 44%)", transform: `translate3d(${motion.bodySway * 0.2}px, ${motion.bodyLift * 0.2}px, 0) scale(${1.02 + motion.breath * 0.02})`, filter: "blur(24px)", opacity: 0.9 }} />
        <img src={config.baseImage} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.54}px, ${motion.bodyLift * 0.92 + motion.talkBounce}px, 0) rotate(${motion.headTilt * 0.14 + motion.shoulderRoll * 0.06}deg)`, 0.98)} />
        {config.layers.hairBack && <img src={config.layers.hairBack} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.28}px, ${motion.bodyLift * 0.44 + motion.talkBounce * 0.3}px, 0) rotate(${motion.headTilt * 0.55}deg) scale(${1.018 + motion.breath * 0.01})`, 0.28)} />}
        {config.layers.bodyShell && <img src={config.layers.bodyShell} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.64}px, ${motion.bodyLift + motion.talkBounce * 0.45}px, 0) rotate(${motion.shoulderRoll * 0.22}deg) scale(${1 + motion.breath * 0.012})`, 0.24)} />}
        {config.layers.faceShell && <img src={config.layers.faceShell} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.94}px, ${motion.bodyLift * 1.24 + motion.listenLean + motion.talkBounce * 0.7}px, 0) rotate(${motion.headTilt}deg)`, 0.34)} />}
        {config.layers.eyeZone && <img src={config.layers.eyeZone} alt="" style={layerStyle(`translate3d(${motion.bodySway * 1.02 + motion.gazeX}px, ${motion.bodyLift * 1.26 + motion.gazeY + motion.listenLean}px, 0) rotate(${motion.headTilt * 1.05}deg)`, 0.46)} />}
        {config.variants?.browLift && <img src={config.variants.browLift} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.9}px, ${motion.bodyLift * 1.18 + motion.gazeY * 0.4 + motion.listenLean}px, 0) rotate(${motion.headTilt}deg)`, motion.browLift * 0.82)} />}
        {config.variants?.browKnit && <img src={config.variants.browKnit} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.9}px, ${motion.bodyLift * 1.18 + motion.gazeY * 0.4 + motion.listenLean}px, 0) rotate(${motion.headTilt}deg)`, motion.browKnit * 0.92)} />}
        {eyes.map((eye, index) => (
          <div key={`eyelid-${index}`} style={{ position: "absolute", left: `${eye.x * 100}%`, top: `${eye.y * 100}%`, width: `${eye.w * 100}%`, height: `${eye.h * 100}%`, overflow: "hidden", transform: `translate3d(${motion.bodySway * 0.92 + motion.gazeX}px, ${motion.bodyLift * 1.2 + motion.gazeY + motion.listenLean}px, 0) rotate(${motion.headTilt}deg)`, pointerEvents: "none" }}>
            <div style={{ width: "100%", height: `${(motion.blinkSoft * 26).toFixed(2)}%`, background: "linear-gradient(180deg, rgba(40,22,28,0.34), rgba(40,22,28,0.06))", borderBottom: "1px solid rgba(16,10,14,0.12)", boxShadow: "0 3px 8px rgba(20,12,18,0.08)", borderRadius: "0 0 999px 999px", transformOrigin: "top center" }} />
          </div>
        ))}
        {config.variants?.eyeGloss && <img src={config.variants.eyeGloss} alt="" style={layerStyle(`translate3d(${motion.bodySway * 0.96 + motion.gazeX * 0.7}px, ${motion.bodyLift * 1.2 + motion.gazeY * 0.7 + motion.listenLean}px, 0) rotate(${motion.headTilt}deg)`, 0.46 + motion.warmth * 0.18 + motion.haloPulse * 0.04)} />}
        {config.layers.mouthCore && <img src={config.layers.mouthCore} alt="" style={layerStyle(`translate3d(${motion.bodySway * 1.02}px, ${motion.bodyLift * 1.28 + motion.cueOpen * 6 + motion.talkBounce * 0.35}px, 0) rotate(${motion.headTilt * 0.9}deg)`, 0.22)} />}
        {mouthSrc && <img src={mouthSrc} alt="" style={layerStyle(`translate3d(${motion.bodySway * 1.04}px, ${motion.bodyLift * 1.3 + motion.cueOpen * 8 + motion.talkBounce * 0.45}px, 0) rotate(${motion.headTilt * 0.9}deg) scale(${1 + motion.cueOpen * 0.02})`, isTalking ? clamp(0.18 + motion.cueOpen * 0.48, 0.14, 0.62) : 0.08)} />}
        {config.layers.hairFront && <img src={config.layers.hairFront} alt="" style={layerStyle(`translate3d(${motion.bodySway * 1.12}px, ${motion.bodyLift * 1.04 + motion.talkBounce * 0.28}px, 0) rotate(${motion.headTilt * 1.22}deg)`, 0.2)} />}
      </div>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 22%, ${motion.hue} 0%, transparent 34%)`, mixBlendMode: "screen", opacity: 0.7, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: "auto 0 0 0", height: "36%", background: "linear-gradient(180deg, transparent, rgba(3,3,5,0.16) 28%, rgba(3,3,5,0.62))", pointerEvents: "none" }} />
    </div>
  );
}
