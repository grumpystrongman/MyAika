import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { initMemory, addMemory, searchMemories } from "./memory.js";
import { Emotion, makeBehavior } from "@myaika/shared";
import { generateAikaVoice, resolveAudioPath } from "./aika_voice/index.js";
import { trimReferenceWavToFile } from "./aika_voice/voice_ref.js";
import { voicesDir } from "./aika_voice/paths.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Load persona
const persona = JSON.parse(
  fs.readFileSync(new URL("./persona.json", import.meta.url), "utf-8")
);
const configPath = new URL("./aika_config.json", import.meta.url);

function readAikaConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { voice: {} };
  }
}

let defaultRefOverride = null;
function prepareDefaultReference() {
  const cfg = readAikaConfig();
  const baseRef = cfg?.voice?.default_reference_wav;
  if (!baseRef) return;
  const inputPath = path.resolve(voicesDir, baseRef);
  if (!fs.existsSync(inputPath)) return;
  const trimmedName = baseRef.replace(/\\.wav$/i, "_trim_6s.wav");
  const outputPath = path.resolve(voicesDir, trimmedName);
  try {
    trimReferenceWavToFile(inputPath, outputPath, { targetSec: 6 });
    defaultRefOverride = trimmedName;
  } catch (err) {
    console.warn("Reference WAV prep failed:", err?.message || err);
  }
}
prepareDefaultReference();

function prepareFemAikaTrim() {
  const femPath = path.resolve(voicesDir, "fem_aika.wav");
  if (!fs.existsSync(femPath)) return;
  const outPath = path.resolve(voicesDir, "fem_aika_trim_6s.wav");
  try {
    trimReferenceWavToFile(femPath, outPath, { targetSec: 6 });
  } catch (err) {
    console.warn("Fem Aika trim failed:", err?.message || err);
  }
}
prepareFemAikaTrim();

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



const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini";

async function fallbackChatCompletion({ systemPrompt, userText, maxOutputTokens }) {
  try {
    const r = await client.chat.completions.create({
      model: FALLBACK_MODEL,
      max_tokens: Math.min(600, Math.max(80, Number(maxOutputTokens) || Number(process.env.OPENAI_MAX_OUTPUT_TOKENS) || 220)),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
      ]
    });
    const choice = r?.choices?.[0]?.message?.content || "";
    return String(choice || "").trim();
  } catch (err) {
    console.error("OPENAI FALLBACK ERROR:", err);
    return "";
  }
}

function extractResponseText(response) {
  if (!response) return "";
  if (response.output_text) return String(response.output_text);
  const output = Array.isArray(response.output) ? response.output : [];
  const parts = [];
  for (const item of output) {
    if (typeof item?.text === "string") {
      parts.push(item.text);
    }
    const content = Array.isArray(item.content) ? item.content : [];
    for (const c of content) {
      if ((c.type === "output_text" || c.type === "text") && typeof c.text === "string") {
        parts.push(c.text);
      }
    }
  }
  return parts.join("\n").trim();
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { userText, maxOutputTokens } = req.body;
    if (!userText || typeof userText !== "string") {
      return res.status(400).json({ error: "userText required" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "missing_openai_api_key" });
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
    let response;
    try {
      response = await client.responses.create({
      model: "gpt-5-mini",
      max_output_tokens: Math.min(600, Math.max(80, Number(maxOutputTokens) || Number(process.env.OPENAI_MAX_OUTPUT_TOKENS) || 220)),
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
    } catch (err) {
      console.error("OPENAI ERROR:", err);
      return res.status(502).json({
        error: "openai_request_failed",
        detail: err?.message || String(err)
      });
    }

    // Extract model text output
    let rawText = extractResponseText(response);
    if (!rawText.trim()) {
      rawText = await fallbackChatCompletion({ systemPrompt, userText, maxOutputTokens });
    }
    if (!rawText.trim()) {
      const summary = {
        output_count: Array.isArray(response?.output) ? response.output.length : 0,
        output_types: Array.isArray(response?.output) ? response.output.map(o => o?.type) : [],
        content_types: Array.isArray(response?.output)
          ? response.output.flatMap(o => (Array.isArray(o?.content) ? o.content.map(c => c?.type) : []))
          : []
      };
      return res.status(502).json({ error: "empty_model_response", detail: JSON.stringify(summary) });
    }

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

// Aika Voice - TTS
app.post("/api/aika/voice", async (req, res) => {
  try {
    const { text, settings } = req.body || {};
    const cfg = readAikaConfig();
    const mergedSettings =
      settings && settings.voice && settings.voice.name
        ? settings
        : {
            ...settings,
            voice: {
              ...settings?.voice,
              name: process.env.TTS_VOICE_NAME || cfg.voice?.default_name || settings?.voice?.name
            }
          };
    if (!mergedSettings.voice?.reference_wav_path && cfg.voice?.default_reference_wav) {
      mergedSettings.voice = {
        ...mergedSettings.voice,
        reference_wav_path: defaultRefOverride || cfg.voice.default_reference_wav
      };
    }
    const result = await generateAikaVoice({ text, settings: mergedSettings });
    if (result.warnings && result.warnings.length > 0) {
      res.set("x-tts-warnings", result.warnings.join(","));
    }
    res.json({
      audioUrl: result.audioUrl,
      meta: result.meta,
      warnings: result.warnings || []
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("Aika Voice ERROR:", err);
    res.status(status).json({
      error: err.message || "aika_voice_failed"
    });
  }
});

app.post("/api/aika/voice/inline", async (req, res) => {
  try {
    const { text, settings } = req.body || {};
    const cfg = readAikaConfig();
    const mergedSettings =
      settings && settings.voice && settings.voice.name
        ? settings
        : {
            ...settings,
            voice: {
              ...settings?.voice,
              name: process.env.TTS_VOICE_NAME || cfg.voice?.default_name || settings?.voice?.name
            }
          };
    if (!mergedSettings.voice?.reference_wav_path && cfg.voice?.default_reference_wav) {
      mergedSettings.voice = {
        ...mergedSettings.voice,
        reference_wav_path: defaultRefOverride || cfg.voice.default_reference_wav
      };
    }
    const result = await generateAikaVoice({ text, settings: mergedSettings });
    if (result.warnings && result.warnings.length > 0) {
      res.set("x-tts-warnings", result.warnings.join(","));
    }
    if (result.filePath.endsWith(".wav")) res.type("audio/wav");
    if (result.filePath.endsWith(".mp3")) res.type("audio/mpeg");
    res.sendFile(result.filePath);
  } catch (err) {
    const status = err.status || 500;
    console.error("Aika Voice inline ERROR:", err);
    res.status(status).json({ error: err.message || "aika_voice_inline_failed" });
  }
});

app.get("/api/aika/voice/:id", (req, res) => {
  const filePath = resolveAudioPath(req.params.id);
  if (!filePath) return res.status(404).json({ error: "not_found" });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "not_found" });
  if (filePath.endsWith(".wav")) res.type("audio/wav");
  if (filePath.endsWith(".mp3")) res.type("audio/mpeg");
  res.sendFile(filePath);
});

app.get("/api/aika/voices", async (_req, res) => {
  try {
    return res.json({ engine: "gptsovits", voices: [] });
  } catch (err) {
    console.error("Aika Voice list ERROR:", err);
    res.status(500).json({ error: "voice_list_failed" });
  }
});

app.post("/api/aika/voice/test", async (req, res) => {
  try {
    const sampleText =
      req.body?.text ||
      "Testing Aika Voice. If you hear this, audio output is working.";
    const result = await generateAikaVoice({
      text: sampleText,
      settings: req.body?.settings || {}
    });
    res.json({
      audioUrl: result.audioUrl,
      meta: result.meta,
      warnings: result.warnings || []
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("Aika Voice test ERROR:", err);
    res.status(status).json({ error: err.message || "voice_test_failed" });
  }
});

app.get("/api/aika/tts/health", async (_req, res) => {
  const engine = process.env.TTS_ENGINE || (process.platform === "win32" ? "sapi" : "coqui");
  if (engine !== "gptsovits") {
    return res.json({ engine, online: engine === "sapi" || engine === "coqui" });
  }
  const ttsUrl = process.env.GPTSOVITS_URL || "http://localhost:9881/tts";
  let healthUrl = ttsUrl;
  try {
    const u = new URL(ttsUrl);
    if (u.pathname.endsWith("/tts")) {
      u.pathname = u.pathname.replace(/\/tts$/, "/docs");
    }
    healthUrl = u.toString();
  } catch {
    healthUrl = ttsUrl.replace(/\/tts$/, "/docs");
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const r = await fetch(healthUrl, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    return res.json({ engine, online: true, status: r.status });
  } catch {
    return res.json({ engine, online: false });
  }
});

app.get("/api/aika/config", (_req, res) => {
  const cfg = readAikaConfig();
  res.json(cfg);
});

app.post("/api/aika/voice/preference", (req, res) => {
  const { name, reference_wav_path } = req.body || {};
  const pref =
    name
      ? `Aika prefers this voice name: ${name}`
      : reference_wav_path
        ? `Aika prefers this voice sample: ${reference_wav_path}`
        : null;
  if (!pref) return res.status(400).json({ error: "voice_preference_required" });

  addMemory(db, {
    role: "assistant",
    content: pref,
    tags: "voice_preference"
  });
  res.json({ ok: true });
});

app.post("/api/aika/voice/prompt", (req, res) => {
  const { prompt_text } = req.body || {};
  if (!prompt_text || typeof prompt_text !== "string") {
    return res.status(400).json({ error: "prompt_text_required" });
  }
  addMemory(db, {
    role: "assistant",
    content: `Aika voice prompt: ${prompt_text}`,
    tags: "voice_prompt"
  });
  res.json({ ok: true });
});

// Start server
const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`✅ Aika server running on http://localhost:${port}`);
});
