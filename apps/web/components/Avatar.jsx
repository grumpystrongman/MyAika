import { useMemo } from "react";

const MOOD_COLORS = {
  happy: "#ffb74d",
  shy: "#f48fb1",
  sad: "#90caf9",
  angry: "#ef5350",
  surprised: "#ffd54f",
  sleepy: "#9fa8da",
  neutral: "#bdbdbd"
};

export default function Avatar({ mood = "neutral", isTalking = false, intensity = 0.35 }) {
  const accent = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  const pulse = 1 + Math.max(0, Math.min(1, intensity)) * 0.05;

  const wrapperStyle = useMemo(
    () => ({
      position: "relative",
      width: "100%",
      maxWidth: 520,
      margin: "0 auto",
      transform: `scale(${isTalking ? pulse : 1})`,
      transition: "transform 120ms ease"
    }),
    [isTalking, pulse]
  );

  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <div style={wrapperStyle}>
        <div
          style={{
            position: "absolute",
            inset: -18,
            borderRadius: 28,
            background: `radial-gradient(circle at 35% 20%, ${accent}40, transparent 70%)`,
            filter: isTalking ? "blur(8px)" : "blur(12px)",
            opacity: 0.8
          }}
        />
        <img
          src="/assets/aika/live2d/placeholder.svg"
          alt="Aika avatar"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: 20,
            boxShadow: "0 18px 60px rgba(0,0,0,0.18)",
            imageRendering: "auto",
            animation: isTalking ? "none" : "idleFloat 4s ease-in-out infinite"
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: 24,
            border: `1px solid ${accent}66`,
            pointerEvents: "none"
          }}
        />
      </div>
      <style jsx>{`
        @keyframes idleFloat {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
          100% { transform: translateY(0px); }
        }
      `}</style>
    </div>
  );
}
