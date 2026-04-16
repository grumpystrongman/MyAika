import { useState } from "react";
import AikaAvatar from "../components/AikaAvatar";

const MOODS = ["neutral", "happy", "teasing", "thinking", "concerned", "surprised"];

export default function AvatarDemo() {
  const [mood, setMood] = useState("neutral");
  const [isTalking, setIsTalking] = useState(false);
  const [talkIntensity, setTalkIntensity] = useState(0.5);
  const [isListening, setIsListening] = useState(false);

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>AIKA Nocturne Avatar Demo</h1>
      <p style={{ margin: 0, color: "#a4a4ad" }}>
        Original human-portrait gothic-hostess renderer with realtime speaking and listening states.
      </p>
      <AikaAvatar
        mood={mood}
        isTalking={isTalking}
        talkIntensity={talkIntensity}
        isListening={isListening}
        engineHint="portrait"
        modelUrl="/assets/aika/portraits/nocturne-human/config.json"
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {MOODS.map(m => (
          <button
            key={m}
            onClick={() => setMood(m)}
            style={{ padding: "8px 12px", borderRadius: 8 }}
          >
            {m}
          </button>
        ))}
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={isTalking}
          onChange={(e) => setIsTalking(e.target.checked)}
        />
        Talking
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={isListening}
          onChange={(e) => setIsListening(e.target.checked)}
        />
        Listening
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        Intensity
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={talkIntensity}
          onChange={(e) => setTalkIntensity(Number(e.target.value))}
        />
        {talkIntensity}
      </label>
    </div>
  );
}
