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
import { readWavMeta } from "./aika_voice/wav_meta.js";
import { listPiperVoices } from "./aika_voice/engine_piper.js";
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  createGoogleDoc,
  appendGoogleDoc,
  uploadDriveFile,
  getGoogleAccessToken
} from "./integrations/google.js";
import {
  fetchFirefliesTranscripts,
  fetchFirefliesTranscript,
  uploadFirefliesAudio,
  markFirefliesConnected
} from "./integrations/fireflies.js";
import { fetchPlexIdentity } from "./integrations/plex.js";
import { sendSlackMessage, sendTelegramMessage, sendDiscordMessage } from "./integrations/messaging.js";
import { getProvider } from "./integrations/store.js";
import {
  getSkillsState,
  toggleSkill,
  getSkillEvents,
  handleSkillMessage,
  listWebhooks,
  addWebhook,
  removeWebhook,
  listScenes,
  addScene,
  removeScene,
  triggerScene,
  exportNotesText,
  exportTodosText,
  exportShoppingText,
  exportRemindersText,
  startReminderScheduler
} from "./skills/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
startReminderScheduler();

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

const integrationsState = {
  google_docs: { connected: false },
  google_drive: { connected: false },
  fireflies: { connected: false },
  facebook: { connected: false },
  instagram: { connected: false },
  whatsapp: { connected: false },
  telegram: { connected: false },
  slack: { connected: false },
  discord: { connected: false },
  plex: { connected: false }
};

const googleStored = getProvider("google");
if (googleStored) {
  integrationsState.google_docs.connected = true;
  integrationsState.google_drive.connected = true;
  integrationsState.google_docs.connectedAt = googleStored.connectedAt || new Date().toISOString();
  integrationsState.google_drive.connectedAt = googleStored.connectedAt || new Date().toISOString();
}

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



const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
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

    const lowerText = userText.toLowerCase();
    if (lowerText.includes("fireflies")) {
      if (!process.env.FIREFLIES_API_KEY) {
        return res.json({
          text:
            "Fireflies is not configured yet. Please set FIREFLIES_API_KEY in apps/server/.env and restart the server.",
          behavior: makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
        });
      }

      const urlMatch = userText.match(/https?:\/\/[^\s]+/i);
      const firefliesUrl = urlMatch ? urlMatch[0] : "";
      let transcriptId = null;
      if (firefliesUrl.includes("app.fireflies.ai/view/")) {
        const idMatch = firefliesUrl.match(/::([A-Za-z0-9]+)/);
        if (idMatch) transcriptId = idMatch[1];
      }

      try {
        let transcript;
        if (!transcriptId) {
          const list = await fetchFirefliesTranscripts(1);
          const latest = list?.data?.transcripts?.[0];
          if (latest?.id) transcriptId = latest.id;
        }
        if (!transcriptId) {
          return res.json({
            text:
              "I couldn't find a Fireflies transcript yet. Share a Fireflies view link or make sure Fireflies has transcripts in your account.",
            behavior: makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
          });
        }

        const detail = await fetchFirefliesTranscript(transcriptId);
        transcript = detail?.data?.transcript;
        if (!transcript) {
          return res.json({
            text: "I couldn't access that transcript. Please confirm the link is valid and your API key has access.",
            behavior: makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
          });
        }

        const summary = transcript.summary || {};
        const summaryText =
          summary.short_summary ||
          summary.short_overview ||
          summary.overview ||
          summary.gist ||
          summary.bullet_gist ||
          "Summary not available yet.";
        const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
        const topics = Array.isArray(summary.topics_discussed) ? summary.topics_discussed : [];
        const transcriptUrl = transcript.transcript_url || firefliesUrl;
        const title = transcript.title || "Fireflies Meeting";

        let docLink = "";
        try {
          await getGoogleAccessToken();
          const doc = await createGoogleDoc(`Aika Notes - ${title}`, [
            `Title: ${title}`,
            `Date: ${transcript.dateString || ""}`,
            `Transcript: ${transcriptUrl}`,
            "",
            "Summary:",
            summaryText,
            "",
            "Key Topics:",
            topics.length ? topics.map(t => `- ${t}`).join("\n") : "- (none)",
            "",
            "Action Items:",
            actionItems.length ? actionItems.map(t => `- ${t}`).join("\n") : "- (none)"
          ].join("\n"));
          if (doc?.documentId) {
            docLink = `https://docs.google.com/document/d/${doc.documentId}/edit`;
          }
        } catch {
          // Google not connected; skip doc creation
        }

        const responseText = [
          `Here's your Fireflies summary for "${title}":`,
          summaryText,
          actionItems.length ? `Action items: ${actionItems.join("; ")}` : "Action items: (none)",
          topics.length ? `Topics: ${topics.join(", ")}` : "Topics: (none)",
          transcriptUrl ? `Transcript link: ${transcriptUrl}` : "",
          docLink ? `Google Doc: ${docLink}` : "Google Doc: (connect Google Docs to enable)"
        ].filter(Boolean).join("\n");

        return res.json({
          text: responseText,
          behavior: makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.45 })
        });
      } catch (err) {
        return res.json({
          text:
            "Fireflies request failed. Please check your FIREFLIES_API_KEY and ensure the transcript is accessible.",
          behavior: makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
        });
      }
    }

    const skillResult = await handleSkillMessage(userText);
    if (skillResult) {
      return res.json({
        text: skillResult.text,
        behavior: makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 }),
        skill: skillResult.skill
      });
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
      model: OPENAI_MODEL,
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

    // Attempt to parse JSON anywhere in the response (model doesn't always put it on its own line)
    const jsonMatches = [...rawText.matchAll(/\{[^{}]*"emotion"[^{}]*\}/gi)];
    if (jsonMatches.length) {
      const lastMatch = jsonMatches[jsonMatches.length - 1][0];
      try {
        const parsed = JSON.parse(lastMatch);
        behavior = makeBehavior({
          emotion: parsed.emotion || behavior.emotion,
          intensity:
            typeof parsed.intensity === "number"
              ? parsed.intensity
              : behavior.intensity,
          speaking: false
        });
        replyText = rawText
          .replace(lastMatch, "")
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();
      } catch {
        // fall back silently
      }
    } else {
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
    const engine = process.env.TTS_ENGINE || (process.platform === "win32" ? "sapi" : "coqui");
    if (engine === "piper") {
      const piperVoices = listPiperVoices();
      return res.json({ engine, voices: piperVoices, piperVoices });
    }
    return res.json({ engine, voices: [], piperVoices: listPiperVoices() });
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

app.get("/api/aika/tts/diagnostics", async (_req, res) => {
  const engine = process.env.TTS_ENGINE || (process.platform === "win32" ? "sapi" : "coqui");
  const cfg = readAikaConfig();
  const defaultRef = defaultRefOverride || cfg?.voice?.default_reference_wav || "";
  const resolvedRef = defaultRef ? path.resolve(voicesDir, defaultRef) : "";
  const refExists = resolvedRef ? fs.existsSync(resolvedRef) : false;
  let refMeta = null;
  if (refExists) {
    try {
      refMeta = readWavMeta(resolvedRef);
    } catch {
      refMeta = null;
    }
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

  let gptOnline = false;
  let gptStatus = null;
  if (engine === "gptsovits") {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const r = await fetch(healthUrl, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      gptOnline = r.ok;
      gptStatus = r.status;
    } catch {
      gptOnline = false;
    }
  }

  res.json({
    engine,
    gptsovits: {
      url: ttsUrl,
      docsUrl: healthUrl,
      online: gptOnline,
      status: gptStatus,
      configPath: process.env.GPTSOVITS_CONFIG || "",
      configExists: process.env.GPTSOVITS_CONFIG
        ? fs.existsSync(path.resolve(process.env.GPTSOVITS_CONFIG))
        : false,
      repoPath: process.env.GPTSOVITS_REPO_PATH || "",
      pythonBin: process.env.GPTSOVITS_PYTHON_BIN || ""
    },
    reference: {
      default: defaultRef,
      resolved: resolvedRef,
      exists: refExists,
      duration: refMeta?.duration ?? null,
      sampleRate: refMeta?.sampleRate ?? null
    }
  });
});

app.get("/api/aika/config", (_req, res) => {
  const cfg = readAikaConfig();
  res.json(cfg);
});

app.get("/api/integrations", (_req, res) => {
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const firefliesConfigured = Boolean(process.env.FIREFLIES_API_KEY);
  const plexConfigured = Boolean(process.env.PLEX_URL && process.env.PLEX_TOKEN);
  res.json({
    integrations: {
      ...integrationsState,
      google_docs: { ...integrationsState.google_docs, configured: googleConfigured },
      google_drive: { ...integrationsState.google_drive, configured: googleConfigured },
      fireflies: { ...integrationsState.fireflies, configured: firefliesConfigured },
      plex: { ...integrationsState.plex, configured: plexConfigured }
    }
  });
});

app.get("/api/skills", (_req, res) => {
  res.json({
    skills: getSkillsState(),
    events: getSkillEvents()
  });
});

app.get("/api/skills/events", (_req, res) => {
  res.json({ events: getSkillEvents() });
});

app.post("/api/skills/toggle", (req, res) => {
  const { key, enabled } = req.body || {};
  if (!key || typeof enabled !== "boolean") {
    return res.status(400).json({ error: "key_and_enabled_required" });
  }
  const ok = toggleSkill(key, enabled);
  if (!ok) return res.status(404).json({ error: "unknown_skill" });
  res.json({ ok: true, key, enabled });
});

app.get("/api/skills/webhooks", (_req, res) => {
  res.json({ webhooks: listWebhooks() });
});

app.post("/api/skills/webhooks", (req, res) => {
  const { name, url } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name_and_url_required" });
  const webhook = addWebhook(name, url);
  res.json({ ok: true, webhook });
});

app.delete("/api/skills/webhooks/:name", (req, res) => {
  const ok = removeWebhook(req.params.name);
  if (!ok) return res.status(404).json({ error: "webhook_not_found" });
  res.json({ ok: true });
});

app.get("/api/skills/scenes", (_req, res) => {
  res.json({ scenes: listScenes() });
});

app.post("/api/skills/scenes", (req, res) => {
  const { name, hooks } = req.body || {};
  if (!name || !Array.isArray(hooks)) return res.status(400).json({ error: "name_and_hooks_required" });
  const scene = addScene(name, hooks.map(h => String(h).trim()).filter(Boolean));
  res.json({ ok: true, scene });
});

app.delete("/api/skills/scenes/:name", (req, res) => {
  const ok = removeScene(req.params.name);
  if (!ok) return res.status(404).json({ error: "scene_not_found" });
  res.json({ ok: true });
});

app.post("/api/skills/scenes/trigger", async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name_required" });
  try {
    const scene = await triggerScene(name, "manual");
    if (!scene) return res.status(404).json({ error: "scene_not_found" });
    res.json({ ok: true, scene });
  } catch (err) {
    res.status(500).json({ error: err.message || "scene_trigger_failed" });
  }
});

app.get("/api/skills/export/:type", (req, res) => {
  const { type } = req.params;
  let text = "";
  switch (type) {
    case "notes":
      text = exportNotesText();
      break;
    case "todos":
      text = exportTodosText();
      break;
    case "shopping":
      text = exportShoppingText();
      break;
    case "reminders":
      text = exportRemindersText();
      break;
    default:
      return res.status(404).json({ error: "unknown_export_type" });
  }
  res.type("text/plain").send(text || "");
});

app.get("/api/status", async (_req, res) => {
  const engine = process.env.TTS_ENGINE || (process.platform === "win32" ? "sapi" : "coqui");
  let ttsOnline = false;
  if (engine === "gptsovits") {
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
      const timeout = setTimeout(() => controller.abort(), 1200);
      const r = await fetch(healthUrl, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      ttsOnline = r.ok;
    } catch {
      ttsOnline = false;
    }
  }

  res.json({
    server: { ok: true, uptimeSec: Math.floor(process.uptime()) },
    tts: { engine, online: ttsOnline },
    integrations: integrationsState,
    skills: {
      enabled: getSkillsState().filter(s => s.enabled).length,
      total: getSkillsState().length,
      lastEvent: getSkillEvents()[0] || null
    },
    openai: {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 220)
    },
    system: {
      platform: process.platform,
      node: process.version
    }
  });
});

app.post("/api/integrations/connect", (req, res) => {
  const { provider } = req.body || {};
  if (!provider || !integrationsState[provider]) {
    return res.status(400).json({ error: "invalid_provider" });
  }
  integrationsState[provider].connected = true;
  integrationsState[provider].connectedAt = new Date().toISOString();
  res.json({ ok: true, provider });
});

app.post("/api/integrations/disconnect", (req, res) => {
  const { provider } = req.body || {};
  if (!provider || !integrationsState[provider]) {
    return res.status(400).json({ error: "invalid_provider" });
  }
  integrationsState[provider].connected = false;
  delete integrationsState[provider].connectedAt;
  res.json({ ok: true, provider });
});

app.get("/api/integrations/google/auth/start", (_req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).send("google_oauth_not_configured");
    }
    const state = Math.random().toString(36).slice(2);
    const url = getGoogleAuthUrl(state);
    res.redirect(url);
  } catch (err) {
    res.status(500).send(err.message || "google_auth_failed");
  }
});

app.get("/api/integrations/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("missing_code");
    const token = await exchangeGoogleCode(String(code));
    integrationsState.google_docs.connected = true;
    integrationsState.google_drive.connected = true;
    integrationsState.google_docs.connectedAt = new Date().toISOString();
    integrationsState.google_drive.connectedAt = new Date().toISOString();
    // store token in persistent store
    await (async () => {
      const { setProvider } = await import("./integrations/store.js");
      setProvider("google", { ...token, connectedAt: new Date().toISOString() });
    })();
    res.send("<html><body><h3>Google connected. You can close this tab.</h3></body></html>");
  } catch (err) {
    res.status(500).send(err.message || "google_auth_failed");
  }
});

app.get("/api/integrations/google/status", async (_req, res) => {
  try {
    const token = await getGoogleAccessToken();
    res.json({ ok: true, connected: true, tokenPresent: Boolean(token) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "google_not_connected" });
  }
});

app.post("/api/integrations/google/docs/create", async (req, res) => {
  try {
    const { title, content } = req.body || {};
    const doc = await createGoogleDoc(title || "Aika Notes", content || "");
    res.json({ ok: true, doc });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_docs_create_failed" });
  }
});

app.post("/api/integrations/google/docs/append", async (req, res) => {
  try {
    const { documentId, content } = req.body || {};
    if (!documentId || !content) {
      return res.status(400).json({ error: "documentId_and_content_required" });
    }
    const result = await appendGoogleDoc(documentId, content);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_docs_append_failed" });
  }
});

app.post("/api/integrations/google/drive/upload", async (req, res) => {
  try {
    const { name, content, mimeType } = req.body || {};
    if (!name || !content) return res.status(400).json({ error: "name_and_content_required" });
    const file = await uploadDriveFile(name, content, mimeType || "text/plain");
    res.json({ ok: true, file });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_drive_upload_failed" });
  }
});

app.get("/api/integrations/fireflies/transcripts", async (req, res) => {
  try {
    markFirefliesConnected();
    const limit = Number(req.query.limit || 5);
    const data = await fetchFirefliesTranscripts(limit);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message || "fireflies_failed" });
  }
});

app.get("/api/integrations/fireflies/transcripts/:id", async (req, res) => {
  try {
    markFirefliesConnected();
    const data = await fetchFirefliesTranscript(req.params.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message || "fireflies_transcript_failed" });
  }
});

app.post("/api/integrations/fireflies/upload", async (req, res) => {
  try {
    const { url, title, webhook, language } = req.body || {};
    if (!url) return res.status(400).json({ error: "url_required" });
    const data = await uploadFirefliesAudio({ url, title, webhook, language });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message || "fireflies_upload_failed" });
  }
});

app.get("/api/integrations/plex/identity", async (_req, res) => {
  try {
    const xml = await fetchPlexIdentity();
    integrationsState.plex.connected = true;
    integrationsState.plex.connectedAt = new Date().toISOString();
    res.type("application/xml").send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message || "plex_failed" });
  }
});

app.post("/api/integrations/slack/post", async (req, res) => {
  try {
    const { channel, text } = req.body || {};
    if (!channel || !text) return res.status(400).json({ error: "channel_and_text_required" });
    const data = await sendSlackMessage(channel, text);
    integrationsState.slack.connected = true;
    integrationsState.slack.connectedAt = new Date().toISOString();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message || "slack_failed" });
  }
});

app.post("/api/integrations/telegram/send", async (req, res) => {
  try {
    const { chatId, text } = req.body || {};
    if (!chatId || !text) return res.status(400).json({ error: "chatId_and_text_required" });
    const data = await sendTelegramMessage(chatId, text);
    integrationsState.telegram.connected = true;
    integrationsState.telegram.connectedAt = new Date().toISOString();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message || "telegram_failed" });
  }
});

app.post("/api/integrations/discord/send", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "text_required" });
    const data = await sendDiscordMessage(text);
    integrationsState.discord.connected = true;
    integrationsState.discord.connectedAt = new Date().toISOString();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message || "discord_failed" });
  }
});

app.post("/api/agent/task", async (req, res) => {
  const { type, payload } = req.body || {};
  try {
    switch (type) {
      case "plex_identity": {
        const xml = await fetchPlexIdentity();
        return res.json({ ok: true, data: xml });
      }
      case "fireflies_transcripts": {
        const limit = Number(payload?.limit || 5);
        const data = await fetchFirefliesTranscripts(limit);
        return res.json({ ok: true, data });
      }
      case "slack_post": {
        const data = await sendSlackMessage(payload?.channel, payload?.text);
        return res.json({ ok: true, data });
      }
      case "telegram_send": {
        const data = await sendTelegramMessage(payload?.chatId, payload?.text);
        return res.json({ ok: true, data });
      }
      case "discord_send": {
        const data = await sendDiscordMessage(payload?.text);
        return res.json({ ok: true, data });
      }
      default:
        return res.status(400).json({ error: "unknown_task" });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || "agent_task_failed" });
  }
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
