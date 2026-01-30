 "use client";
import { useEffect, useRef, useState } from "react";
import type { AvatarEngine, Mood } from "../avatar/AvatarEngine";
import { Live2DWebEngine } from "../avatar/Live2DWebEngine";
import { PngAvatarEngine } from "../avatar/PngAvatarEngine";

type Props = {
  mood: Mood;
  isTalking: boolean;
  talkIntensity?: number;
  isListening: boolean;
  className?: string;
  modelUrl?: string;
  fallbackPng?: string;
};

const FALLBACK_PNG = "/assets/aika/live2d/placeholder.svg";

export default function AikaAvatar({
  mood,
  isTalking,
  talkIntensity = 0.5,
  isListening,
  className,
  modelUrl,
  fallbackPng
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pngRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AvatarEngine | null>(null);
  const [engineType, setEngineType] = useState<"live2d" | "png">("png");
  const [loadError, setLoadError] = useState<string>("");

  useEffect(() => {
    let destroyed = false;

    async function initEngine() {
      if (!hostRef.current || !canvasRef.current) return;
      if (typeof window === "undefined") return;
      setLoadError("");

      const targetModel = modelUrl || "";
      const targetPng = fallbackPng || FALLBACK_PNG;

      const canUseWebGL = !!canvasRef.current.getContext("webgl");
      let useLive2D = false;
      if (canUseWebGL && targetModel) {
        try {
          const r = await fetch(targetModel, { method: "HEAD" });
          useLive2D = r.ok;
        } catch {
          useLive2D = false;
        }
      }

      if (destroyed) return;

      if (useLive2D) {
        try {
          const live = new Live2DWebEngine(canvasRef.current);
          await live.load(targetModel);
          engineRef.current = live;
          setEngineType("live2d");
          return;
        } catch (err: any) {
          setLoadError(err?.message || "live2d_load_failed");
          // fall back to PNG
        }
      }

      if (!pngRef.current) return;
      const png = new PngAvatarEngine(pngRef.current, targetPng);
      await png.load(targetModel);
      engineRef.current = png;
      setEngineType("png");
    }

    initEngine();
    return () => {
      destroyed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [modelUrl, fallbackPng]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setMood(mood);
    engine.setTalking(isTalking, talkIntensity);
    engine.setListening(isListening);
    engine.setIdle(true);
  }, [mood, isTalking, talkIntensity, isListening]);

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

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width: "100%",
        maxWidth: 520,
        aspectRatio: "3 / 4",
        margin: "0 auto",
        position: "relative"
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: engineType === "live2d" ? "block" : "none",
          borderRadius: 20
        }}
      />
      {engineType === "png" && (
        <div
          ref={pngRef}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
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
