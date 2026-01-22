import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "node:fs";
import OpenAI from "openai";
import { initMemory, addMemory, searchMemories } from "./memory.js";
import { Emotion, makeBehavior } from "@myaika/shared";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const persona = JSON.parse(fs.readFileSync(new URL("./persona.json", import.meta.url)));
const db = initMemory();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function inferBehaviorFromText(text) {
  const t = text.toLowerCase();
  if (t.includes("thank") || t.includes("love") || t.includes("yay")) return makeBehavior({ emotion: Emotion.HAPPY, intensity: 0.55 });
  if (t.includes("sorry") || t.includes("sad")) return makeBehavior({ emotion: Emotion.SAD, intensity: 0.55 });
  if (t.includes("angry") || t.includes("mad")) return makeBehavior({ emotion: Emotion.ANGRY, intensity: 0.6 });
  if (t.includes("wow") || t.includes("what?!") || t.includes("what?")) return makeBehavior({ emotion: Emotion.SURPRISED, intensity: 0.6 });
  if (t.includes("tired") || t.includes("sleep")) return makeBehavior({ emotion: Emotion.SLEEPY, intensity: 0.6 });
  if (t.includes("embarrass") || t.includes("blush")) return makeBehavior({ emotion: Emotion.SHY, intensity: 0.55 });
  return makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/chat", async (req, res) => {
  try {
    const { userText } = req.body;
    if (!userText || typeof userText !== "string") {
      return res.status(400).json({ error: "userText required" });
    }

    addMemory(db, { role: "user", content: userText, tags: "message" });

    const memories = searchMemories(db, userText, 8);
    const memoryBlock = memories.map(m => `- [${m.created_at}] (${m.role}) ${m.content}`).join("\n");

    const systemPrompt = `
You are ${persona.name}. Identity core:
- Style: ${persona.style}
- Canon: ${persona.canon}
- Boundaries: ${persona.boundaries}
- Memory rule: ${persona.memory_rules}

Use retrieved memories as truth unless contradicted by the user now.
Keep replies conversational and concise.
Also output a JSON object at the END with keys:
  emotion: one of ${Object.values(Emotion).join(", ")}
  intensity: number 0..1
Format:
<reply text>
<json on its own line>
`.trim();

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            { type: "text", text: systemPrompt },
            { type: "text", text: `Relevant memories:\n${memoryBlock || "(none)"}` }
          ]
        },
        { role: "user", content: [{ type: "text", text: userText }] }
      ]
    });

    const raw = response.output_text || "";
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

    let behavior = inferBehaviorFromText(userText);
    let text = raw;

    const maybeJson = lines[lines.length - 1];
    if (maybeJson?.startsWith("{") && maybeJson?.endsWith("}")) {
      try {
        const parsed = JSON.parse(maybeJson);
        behavior = makeBehavior({
          emotion: parsed.emotion || behavior.emotion,
          intensity: parsed.intensity ?? behavior.intensity,
          speaking: false
        });
        text = lines.slice(0, -1).join("\n");
      } catch {
        // keep inferred behavior
      }
    }

    addMemory(db, { role: "assistant", content: text, tags: "reply" });

    res.json({ text, behavior });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chat_failed" });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
