import { useMemo, useState } from "react";
import { Emotion } from "@myaika/shared";

function Stage2D({ behavior }) {
  const mood = behavior?.emotion || Emotion.NEUTRAL;
  const intensity = behavior?.intensity ?? 0.4;

  const face = useMemo(() => {
    switch (mood) {
      case Emotion.HAPPY: return "😊";
      case Emotion.SHY: return "😳";
      case Emotion.SAD: return "😔";
      case Emotion.ANGRY: return "😠";
      case Emotion.SURPRISED: return "😮";
      case Emotion.SLEEPY: return "🥱";
      default: return "🙂";
    }
  }, [mood]);

  const scale = 1 + intensity * 0.15;
  const glow = Math.floor(80 + intensity * 140);

  return (
    <div style={{
      height: "100%",
      display: "grid",
      placeItems: "center",
      background: `radial-gradient(circle at 50% 40%, rgb(${glow}, ${glow}, 255), #f7f5ff 70%)`
    }}>
      <div style={{
        fontSize: 140,
        transform: `scale(${scale})`,
        transition: "transform 150ms ease",
        filter: behavior?.speaking ? "drop-shadow(0 0 14px rgba(120,120,255,0.65))" : "none"
      }}>
        {face}
      </div>
      <div style={{ position: "absolute", bottom: 18, opacity: 0.7, fontSize: 14 }}>
        2D Body Placeholder (next: Inochi2D)
      </div>
    </div>
  );
}

export default function Home() {
  const [userText, setUserText] = useState("");
  const [log, setLog] = useState([{ role: "assistant", text: "Hi. I’m Aika. Ready to become real? 🌙" }]);
  const [behavior, setBehavior] = useState({ emotion: Emotion.NEUTRAL, intensity: 0.35, speaking: false });

  async function send() {
    const text = userText.trim();
    if (!text) return;

    setLog(l => [...l, { role: "user", text }]);
    setUserText("");

    const r = await fetch("http://localhost:8787/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userText: text })
    });

    const data = await r.json();
    const reply = data.text || "(no reply)";
    const b = data.behavior || behavior;

    setBehavior({ ...b, speaking: true });
    setLog(l => [...l, { role: "assistant", text: reply }]);

    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(reply);
      u.onend = () => setBehavior(prev => ({ ...prev, speaking: false }));
      window.speechSynthesis.speak(u);
    } else {
      setBehavior(prev => ({ ...prev, speaking: false }));
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", height: "100vh" }}>
      <div style={{ position: "relative" }}>
        <Stage2D behavior={behavior} />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ flex: 1, overflow: "auto", border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "white" }}>
          {log.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <b>{m.role === "user" ? "You" : "Aika"}:</b> {m.text}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Say something…"
            style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ccc" }}
          />
          <button onClick={send} style={{ padding: "12px 16px", borderRadius: 12 }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
