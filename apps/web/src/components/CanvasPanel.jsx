import { useEffect, useState } from "react";

export default function CanvasPanel({ serverUrl }) {
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");

  async function loadCards() {
    try {
      const resp = await fetch(`${serverUrl}/api/canvas`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "canvas_load_failed");
      setCards(data?.cards || []);
    } catch (err) {
      setError(err?.message || "canvas_load_failed");
    }
  }

  useEffect(() => {
    loadCards();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Live Canvas</div>
      {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {cards.map(card => (
          <div key={card.cardId} style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 12, background: "var(--panel-bg)" }}>
            <div style={{ fontWeight: 600 }}>{card.kind || "card"}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Updated: {card.updatedAt || card.createdAt}</div>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(card.content, null, 2)}</pre>
          </div>
        ))}
        {cards.length === 0 && <div style={{ fontSize: 12 }}>No canvas cards yet.</div>}
      </div>
    </div>
  );
}

