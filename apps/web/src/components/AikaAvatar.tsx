 "use client";
import { useEffect, useRef, useState } from "react";
import type { AvatarEngine, AvatarLipsyncSequence, Mood } from "../avatar/AvatarEngine";
import { CinematicAvatarEngine } from "../avatar/CinematicAvatarEngine";
import LayeredStageAvatar from "./LayeredStageAvatar";
import { PortraitAvatarEngine } from "../avatar/PortraitAvatarEngine";
import TalkingHeadAvatar from "./TalkingHeadAvatar";
import LenoreAvatar from "./LenoreAvatar";

type Props = {
  mood: Mood;
  isTalking: boolean;
  talkIntensity?: number;
  isListening: boolean;
  lipsyncSequence?: AvatarLipsyncSequence | null;
  lipsyncStartTimeMs?: number;
  className?: string;
  modelUrl?: string;
  reviewModelUrl?: string;
  engineHint?: string;
  portraitConfig?: unknown;
  fallbackPng?: string;
  pngSet?: unknown;
  backgroundSrc?: string;
  avatarAppearance?: Record<string, unknown>;
  avatarMotion?: Record<string, unknown>;
};

const FALLBACK_PNG = "/assets/aika/live2d/placeholder.svg";

function normalizeMood(value: Mood | string): Mood {
  const key = String(value || "").toLowerCase();
  switch (key) {
    case "happy":
      return "happy";
    case "shy":
      return "happy";
    case "sad":
      return "thinking";
    case "sleepy":
      return "thinking";
    case "angry":
      return "concerned";
    case "concerned":
      return "concerned";
    case "surprised":
      return "surprised";
    case "thinking":
      return "thinking";
    case "warm_supportive":
      return "happy";
    case "witty_playful":
      return "happy";
    case "analytical":
      return "thinking";
    case "serious":
      return "concerned";
    case "reflective":
      return "thinking";
    case "teasing":
      return "teasing";
    case "focused_executive":
      return "concerned";
    default:
      return "neutral";
  }
}

export default function AikaAvatar({
  mood,
  isTalking,
  talkIntensity = 0.5,
  isListening,
  lipsyncSequence,
  lipsyncStartTimeMs = 0,
  className,
  modelUrl,
  reviewModelUrl,
  engineHint,
  portraitConfig,
  fallbackPng,
  pngSet,
  backgroundSrc,
  avatarAppearance,
  avatarMotion
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const engineRef = useRef<AvatarEngine | null>(null);
  const [engineType, setEngineType] = useState<"live2d" | "canvas">("canvas");
  const [loadError, setLoadError] = useState<string>("");
  const targetEngine = String(engineHint || "").toLowerCase();

  useEffect(() => {
    let destroyed = false;

    async function initEngine() {
      if (!hostRef.current) return;
      if (typeof window === "undefined") return;
      setLoadError("");

      const targetModel = modelUrl || "";

      if (targetEngine === "stage" || targetEngine === "talkinghead") {
        engineRef.current?.destroy();
        engineRef.current = null;
        return;
      }

      if (targetEngine === "portrait") {
        if (!canvasRef.current) return;
        const portrait = new PortraitAvatarEngine(
          canvasRef.current,
          (portraitConfig && typeof portraitConfig === "object")
            ? portraitConfig as Record<string, unknown>
            : undefined
        );
        await portrait.load(targetModel);
        engineRef.current = portrait;
        setEngineType("canvas");
        return;
      }

      let useLive2D = Boolean(targetModel);
      if (useLive2D) {
        try {
          const r = await fetch(targetModel, { method: "HEAD" });
          useLive2D = r.ok;
        } catch {
          useLive2D = false;
        }
      }

      if (destroyed) return;

      if (useLive2D) {
        setEngineType("live2d");
        return;
      }

      if (!canvasRef.current) return;
      const cinematic = new CinematicAvatarEngine(canvasRef.current);
      await cinematic.load(targetModel);
      engineRef.current = cinematic;
      setEngineType("canvas");
    }

    initEngine();
    return () => {
      destroyed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [modelUrl, portraitConfig, targetEngine]);

  useEffect(() => {
    const engine = engineRef.current;
    const resolvedMood = normalizeMood(mood);
    if (engine) {
      engine.setMood(resolvedMood);
      engine.setTalking(isTalking, talkIntensity);
      engine.setLipSyncSequence?.(lipsyncSequence || null, lipsyncStartTimeMs);
      engine.setListening(isListening);
      engine.setIdle(true);
      return;
    }
    if (engineType === "live2d" && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: "state",
        mood: resolvedMood,
        isTalking,
        talkIntensity,
        isListening,
        lipsyncSequence,
        lipsyncStartTimeMs
      }, "*");
    }
  }, [mood, isTalking, talkIntensity, isListening, lipsyncSequence, lipsyncStartTimeMs]);

  useEffect(() => {
    if (!hostRef.current) return;
    const el = hostRef.current;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        engineRef.current?.resize(width, height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isVideoBackground = Boolean(backgroundSrc && /\.(mp4|webm|ogg)$/i.test(backgroundSrc));

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev?.data?.type === "live2d_error") {
        const message = ev.data.message || "live2d_load_failed";
        setLoadError(message);
        if (canvasRef.current) {
          const cinematic = new CinematicAvatarEngine(canvasRef.current);
          cinematic.load(modelUrl || "");
          engineRef.current?.destroy();
          engineRef.current = cinematic;
          setEngineType("canvas");
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [engineHint, modelUrl, portraitConfig]);

  if (targetEngine === "talkinghead") {
    if (/lenore/i.test(String(modelUrl || ""))) {
      return (
        <LenoreAvatar
          className={className}
          modelUrl={modelUrl}
          reviewModelUrl={reviewModelUrl}
          mood={normalizeMood(mood)}
          isTalking={isTalking}
          talkIntensity={talkIntensity}
          isListening={isListening}
          lipsyncSequence={lipsyncSequence}
          lipsyncStartTimeMs={lipsyncStartTimeMs}
          backgroundSrc={backgroundSrc}
          avatarAppearance={avatarAppearance}
          avatarMotion={avatarMotion}
        />
      );
    }
    return (
      <TalkingHeadAvatar
        className={className}
        modelUrl={modelUrl}
        mood={normalizeMood(mood)}
        isTalking={isTalking}
        talkIntensity={talkIntensity}
        isListening={isListening}
        lipsyncSequence={lipsyncSequence}
        lipsyncStartTimeMs={lipsyncStartTimeMs}
        backgroundSrc={backgroundSrc}
        avatarAppearance={avatarAppearance}
      />
    );
  }

  if (targetEngine === "stage") {
    return (
      <LayeredStageAvatar
        className={className}
        modelUrl={modelUrl}
        mood={normalizeMood(mood)}
        isTalking={isTalking}
        talkIntensity={talkIntensity}
        isListening={isListening}
        lipsyncSequence={lipsyncSequence}
        lipsyncStartTimeMs={lipsyncStartTimeMs}
        backgroundSrc={backgroundSrc}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width: "100%",
        maxWidth: targetEngine === "portrait" ? 680 : 520,
        aspectRatio: targetEngine === "portrait" ? "2 / 3" : "3 / 4",
        margin: "0 auto",
        position: "relative"
      }}
    >
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
              borderRadius: 20,
              filter: "saturate(1.05)",
              zIndex: 1,
              pointerEvents: "none"
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 20,
              backgroundImage: `url(${backgroundSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "saturate(1.05)",
              zIndex: 1,
              pointerEvents: "none"
            }}
          />
        )
      )}
      {engineType === "live2d" ? (
        <iframe
          ref={iframeRef}
          title="Aika Live2D"
          src={modelUrl ? `/live2d_iframe.html?model=${encodeURIComponent(modelUrl)}` : "/live2d_iframe.html"}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: 20,
            background: "transparent",
            position: "relative",
            zIndex: 2
          }}
          allow="autoplay"
        />
      ) : (
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            borderRadius: 20,
            position: "relative",
            zIndex: 2
          }}
        />
      )}
      {loadError && (
        <div
          style={{
            position: "absolute",
            inset: "auto 8px 8px 8px",
            background: "rgba(15,23,42,0.72)",
            color: "#e2e8f0",
            fontSize: 11,
            padding: "6px 8px",
            borderRadius: 8
          }}
        >
          Live2D error: {loadError}
        </div>
      )}
    </div>
  );
}
