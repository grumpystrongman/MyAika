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

// Load persona
const persona = JSON.parse(
  fs.readFileSync(new URL("./persona.json", import.meta.url), "utf-8")
);

// Init memory + OpenAI
const db = initMemory();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Heuristic fallback behavior
function inferBehaviorFromText(text) {
  const t = text.toLowerCase();
  if (t.includes("thank") || t.includes("love") || t.includes("yay"))
    return makeBehavior({ emotion: Emotion.HAPPY, intensity: 0.55 });
  if (t.includes("sorry") || t.includes("sad"))
    return makeBehavior({ emotion: Emotion.SAD, intensity: 0.55 });
  if (t.includes("angry") || t.includes("mad"))
    return makeBehavior({ emotion: Emotion.ANGRY, intensity: 0.6 });
  if (t.includes("wow") || t.includes("what"))
    return makeBehavior({ emotion: Emotion.SURPRISED, intensity: 0.6 });
  if (t.includes("tired") || t.includes("sleep"))
    return makeBehavior({ emotion: Emotion.SLEEPY, intensity: 0.6 });
  if (t.includes("embarrass") || t.includes("blush"))
    return makeBehavior({ emotion: Emotion.SHY, intensity: 0.55 });

  return makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 });
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { userText } = req.body;
    if (!userText || typeof userText !== "string") {
      return res.status(400).json({ error: "userText required" });
    }

    // Save user message
    addMemory(db, {
      role: "user",
      content: userText,
      tags: "message"
    });

    // Retrieve relevant memories
    const memories = searchMemories(db, userText, 8);
    const memoryBlock =
      memories.length > 0
        ? memories
            .map(
              m =>
                `- [${m.created_at}] (${m.role}) ${m.content}`
            )
            .join("\n")
        : "(none)";

    const systemPrompt = `
You are ${persona.name}.

IDENTITY:
- Style: ${persona.style}
- Canon: ${persona.canon}
- Boundaries: ${persona.boundaries}
- Memory rule: ${persona.memory_rules}

INSTRUCTIONS:
- Be conversational and warm
- Use memories as true unless corrected
- Keep responses concise
- At the END, output a JSON object on its own line:
  {
    "emotion": one of ${Object.values(Emotion).join(", ")},
    "intensity": number between 0 and 1
  }
`.trim();

    // ✅ CORRECT Responses API CALL
    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            { type: "input_text", text: systemPrompt },
            {
              type: "input_text",
              text: `Relevant memories:\n${memoryBlock}`
            }
          ]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userText }
          ]
        }
      ]
    });

    // Extract model text output
    const rawText = response.output_text || "";

    const lines = rawText
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    let behavior = inferBehaviorFromText(userText);
    let replyText = rawText;

    // Attempt to parse final-line JSON
    const lastLine = lines[lines.length - 1];
    if (lastLine && lastLine.startsWith("{") && lastLine.endsWith("}")) {
      try {
        const parsed = JSON.parse(lastLine);
        behavior = makeBehavior({
          emotion: parsed.emotion || behavior.emotion,
          intensity:
            typeof parsed.intensity === "number"
              ? parsed.intensity
              : behavior.intensity,
          speaking: false
        });
        replyText = lines.slice(0, -1).join("\n");
      } catch {
        // fall back silently
      }
    }

    // Save assistant reply
    addMemory(db, {
      role: "assistant",
      content: replyText,
      tags: "reply"
    });

    res.json({
      text: replyText,
      behavior
    });
  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ error: "chat_failed" });
  }
});

// Start server
const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`✅ Aika server running on http://localhost:${port}`);
});
