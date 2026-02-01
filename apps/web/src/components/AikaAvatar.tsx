 "use client";
import { useEffect, useRef, useState } from "react";
import type { AvatarEngine, Mood } from "../avatar/AvatarEngine";
import { PngAvatarEngine } from "../avatar/PngAvatarEngine";

type Props = {
  mood: Mood;
  isTalking: boolean;
  talkIntensity?: number;
  isListening: boolean;
  className?: string;
  modelUrl?: string;
  fallbackPng?: string;
  backgroundSrc?: string;
};

const FALLBACK_PNG = "/assets/aika/live2d/placeholder.svg";

export default function AikaAvatar({
  mood,
  isTalking,
  talkIntensity = 0.5,
  isListening,
  className,
  modelUrl,
  fallbackPng,
  backgroundSrc
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pngRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AvatarEngine | null>(null);
  const [engineType, setEngineType] = useState<"live2d" | "png">("png");
  const [loadError, setLoadError] = useState<string>("");

  useEffect(() => {
    let destroyed = false;

    async function initEngine() {
      if (!hostRef.current) return;
      if (typeof window === "undefined") return;
      setLoadError("");

      const targetModel = modelUrl || "";
      const targetPng = fallbackPng || FALLBACK_PNG;

      let useLive2D = Boolean(targetModel);
      if (useLive2D) {
        try {
          const r = await fetch(targetModel, { method: "HEAD" });
          useLive2D = r.ok;
        } catch {
          useLive2D = true;
        }
      }

      if (destroyed) return;

      if (useLive2D) {
        setEngineType("live2d");
        return;
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
    if (engine) {
      engine.setMood(mood);
      engine.setTalking(isTalking, talkIntensity);
      engine.setListening(isListening);
      engine.setIdle(true);
      return;
    }
    if (engineType === "live2d" && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: "state",
        mood,
        isTalking,
        talkIntensity,
        isListening
      }, "*");
    }
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

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev?.data?.type === "live2d_error") {
        setLoadError(ev.data.message || "live2d_load_failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
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
      {backgroundSrc && (
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
      {engineType === "png" && (
        <div
          ref={pngRef}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
