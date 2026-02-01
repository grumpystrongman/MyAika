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
import { fileURLToPath } from "node:url";
import multer from "multer";
import { importLive2DZip } from "./avatar_import.js";
import {
  connectGoogle,
  exchangeGoogleCode,
  createGoogleDoc,
  appendGoogleDoc,
  uploadDriveFile,
  getGoogleStatus,
  disconnectGoogle,
  listDriveFiles,
  getGoogleDoc,
  getSheetValues,
  appendSheetValues,
  listCalendarEvents,
  createCalendarEvent,
  getSlidesPresentation,
  listMeetSpaces,
  createMeetSpace,
  fetchGoogleUserInfo
} from "./integrations/google.js";
import {
  fetchFirefliesTranscripts,
  fetchFirefliesTranscript,
  uploadFirefliesAudio,
  markFirefliesConnected
} from "./integrations/fireflies.js";
import { fetchPlexIdentity } from "./integrations/plex.js";
import { sendSlackMessage, sendTelegramMessage, sendDiscordMessage } from "./integrations/messaging.js";
import { getProvider, setProvider } from "./integrations/store.js";
import { searchAmazonItems } from "./integrations/amazon_paapi.js";
import { buildMetaAuthUrl, exchangeMetaCode, getMetaToken, storeMetaToken } from "./integrations/meta.js";
import { registry, executor } from "./mcp/index.js";
import { redactPhi } from "./mcp/policy.js";
import { listApprovals, denyApproval } from "./mcp/approvals.js";
import { listToolHistory } from "./storage/history.js";
import { initDb } from "./storage/db.js";
import { runMigrations } from "./storage/schema.js";
import {
  createRecording,
  updateRecording,
  getRecording,
  listRecordings,
  addRecordingChunk,
  listRecordingChunks,
  ensureRecordingDir,
  getRecordingBaseDir,
  writeArtifact,
  deleteRecording
} from "./storage/recordings.js";
import {
  addMemoryEntities,
  deleteMemoryEntitiesForRecording,
  searchMemoryEntities
} from "./storage/memory_entities.js";
import {
  createAgentAction,
  deleteAgentActionsForRecording,
  listAgentActions
} from "./storage/agent_actions.js";
import { combineChunks, transcribeAudio, summarizeTranscript, extractEntities } from "./recordings/processor.js";
import { redactStructured, redactText } from "./recordings/redaction.js";
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

initDb();
runMigrations();

const rateMap = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || "local";
  const now = Date.now();
  const windowMs = 60_000;
  const limit = Number(process.env.RATE_LIMIT_PER_MIN || 60);
  const entry = rateMap.get(key) || { ts: now, count: 0 };
  if (now - entry.ts > windowMs) {
    entry.ts = now;
    entry.count = 0;
  }
  entry.count += 1;
  rateMap.set(key, entry);
  if (entry.count > limit) {
    return res.status(429).json({ error: "rate_limited" });
  }
  next();
}

const serverRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const webPublicDir = path.resolve(serverRoot, "..", "web", "public");
const live2dDir = path.join(webPublicDir, "assets", "aika", "live2d");
const live2dCoreJs = path.join(live2dDir, "live2dcubismcore.js");
const live2dCoreWasm = path.join(live2dDir, "live2dcubismcore.wasm");
const uploadDir = path.resolve(serverRoot, "..", "..", "data", "_live2d_uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const recordingsDir = getRecordingBaseDir();
const sttUploadDir = path.resolve(serverRoot, "..", "..", "data", "_stt_uploads");
if (!fs.existsSync(sttUploadDir)) fs.mkdirSync(sttUploadDir, { recursive: true });
const sttUpload = multer({ dest: sttUploadDir });
const recordingUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const id = req.params.id;
      const dir = ensureRecordingDir(id);
      cb(null, path.join(dir, "chunks"));
    },
    filename: (req, file, cb) => {
      const seq = Number(req.query.seq || req.body?.seq || 0);
      const ext = path.extname(file.originalname || "") || ".webm";
      const name = `${String(seq).padStart(6, "0")}${ext}`;
      cb(null, name);
    }
  })
});

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

function withAvatarStatus(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map(model => {
    const modelUrl = model.modelUrl || "";
    const localPath = modelUrl.startsWith("/")
      ? path.join(webPublicDir, modelUrl.replace(/^\//, ""))
      : path.join(webPublicDir, modelUrl);
    const thumbUrl = model.thumbnail || "";
    const thumbPath = thumbUrl
      ? path.join(webPublicDir, thumbUrl.replace(/^\//, ""))
      : "";
    return {
      ...model,
      available: Boolean(modelUrl) && fs.existsSync(localPath),
      thumbnailAvailable: Boolean(thumbUrl) && fs.existsSync(thumbPath)
    };
  });
}

function getDefaultTtsEngine() {
  if (process.env.TTS_ENGINE && process.env.TTS_ENGINE.trim()) {
    return process.env.TTS_ENGINE.trim().toLowerCase();
  }
  const piperBin = process.env.PIPER_BIN || process.env.PIPER_PYTHON_BIN;
  const piperVoices = listPiperVoices();
  if (piperBin && piperVoices.length) return "piper";
  return "gptsovits";
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
  amazon: { connected: false },
  walmart: { connected: false },
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
const slackStored = getProvider("slack");
if (slackStored?.access_token || slackStored?.bot_token) {
  integrationsState.slack.connected = true;
  integrationsState.slack.connectedAt = slackStored.connectedAt || new Date().toISOString();
}
const discordStored = getProvider("discord");
if (discordStored?.access_token || discordStored?.bot_token || discordStored?.webhook) {
  integrationsState.discord.connected = true;
  integrationsState.discord.connectedAt = discordStored.connectedAt || new Date().toISOString();
}
const telegramStored = getProvider("telegram");
if (telegramStored?.token) {
  integrationsState.telegram.connected = true;
  integrationsState.telegram.connectedAt = telegramStored.connectedAt || new Date().toISOString();
}
const firefliesStored = getProvider("fireflies");
if (firefliesStored?.connected) {
  integrationsState.fireflies.connected = true;
  integrationsState.fireflies.connectedAt = firefliesStored.connectedAt || new Date().toISOString();
}
const plexStored = getProvider("plex");
if (plexStored?.connected) {
  integrationsState.plex.connected = true;
  integrationsState.plex.connectedAt = plexStored.connectedAt || new Date().toISOString();
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

function createOAuthState(provider) {
  const state = Math.random().toString(36).slice(2);
  setProvider(`${provider}_oauth_state`, { state, createdAt: Date.now() });
  return state;
}

function validateOAuthState(provider, incoming) {
  const stored = getProvider(`${provider}_oauth_state`);
  const ok = stored?.state && stored.state === incoming;
  try {
    setProvider(`${provider}_oauth_state`, null);
  } catch {}
  if (!ok) throw new Error(`${provider}_oauth_state_invalid`);
}

function encodeForm(data) {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function getWorkspaceId(req) {
  return req.headers["x-workspace-id"] || "default";
}

function getUserId(req) {
  return req.headers["x-user-id"] || "local";
}

function getBaseUrl() {
  return process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8790}`;
}

function getUiBaseUrl() {
  return process.env.WEB_UI_URL || "http://localhost:3000";
}

function isAdmin(req) {
  return String(req.headers["x-user-role"] || "").toLowerCase() === "admin";
}

function canAccessRecording(req, recording) {
  if (!recording) return false;
  if (recording.workspace_id && recording.workspace_id !== getWorkspaceId(req)) return false;
  if (recording.created_by && recording.created_by !== getUserId(req) && !isAdmin(req)) return false;
  return true;
}

function updateProcessingState(recordingId, patch) {
  const existing = getRecording(recordingId);
  const current = existing?.processing_json || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  updateRecording(recordingId, { processing_json: JSON.stringify(next) });
  return next;
}

async function processRecordingPipeline(recordingId, opts = {}) {
  const recording = getRecording(recordingId);
  if (!recording) return;
  updateProcessingState(recordingId, { stage: "transcribing" });
  updateRecording(recordingId, { status: "processing" });
  const audioPath = recording.storage_path || combineChunks(recordingId, recordingsDir);
  if (audioPath && audioPath !== recording.storage_path) {
    updateRecording(recordingId, { storage_path: audioPath, storage_url: `/api/recordings/${recordingId}/audio` });
  }
  const transcriptResult = await transcribeAudio(audioPath);
  updateRecording(recordingId, {
    transcript_text: transcriptResult.text,
    language: transcriptResult.language,
    transcript_json: JSON.stringify({
      provider: transcriptResult.provider || "unknown",
      segments: transcriptResult.segments || []
    }),
    diarization_json: JSON.stringify(transcriptResult.segments || [])
  });

  updateProcessingState(recordingId, { stage: "summarizing" });
  const summary = await summarizeTranscript(transcriptResult.text || "", recording.title);
  let summaryPayload = {
    overview: summary.overview,
    decisions: summary.decisions,
    actionItems: summary.actionItems,
    risks: summary.risks,
    nextSteps: summary.nextSteps,
    recommendations: summary.recommendations || []
  };
  if (recording.redaction_enabled) {
    summaryPayload = redactStructured(summaryPayload);
  }

  updateRecording(recordingId, {
    summary_json: JSON.stringify(summaryPayload),
    decisions_json: JSON.stringify(summaryPayload.decisions || []),
    tasks_json: JSON.stringify(summaryPayload.actionItems || []),
    risks_json: JSON.stringify(summaryPayload.risks || []),
    next_steps_json: JSON.stringify(summaryPayload.nextSteps || [])
  });

  updateProcessingState(recordingId, { stage: "extracting" });
  const entities = extractEntities(summaryPayload);
  addMemoryEntities(
    entities.map(entity => ({
      ...entity,
      workspaceId: recording.workspace_id || "default",
      recordingId
    }))
  );

  const artifacts = [];
  if (opts.createArtifacts) {
    const content = summary.summaryMarkdown || "";
    const filePath = writeArtifact(recordingId, "summary.md", content);
    artifacts.push({ type: "local", name: "summary.md", path: filePath });
    try {
      const doc = await createGoogleDoc(`${recording.title} Summary`, content);
      const url = doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}/edit` : null;
      artifacts.push({ type: "google_doc", docId: doc.documentId, url });
    } catch (err) {
      // ignore if Google is not configured
    }
  }
  if (artifacts.length) {
    updateRecording(recordingId, { artifacts_json: JSON.stringify(artifacts) });
  }

  updateProcessingState(recordingId, { stage: "ready", doneAt: new Date().toISOString() });
  updateRecording(recordingId, { status: "ready" });
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
    const engine = getDefaultTtsEngine();
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
  const engine = getDefaultTtsEngine();
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
  const engine = getDefaultTtsEngine();
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

app.get("/api/aika/avatar/models", (_req, res) => {
  try {
    const manifestPath = path.join(live2dDir, "models.json");
    if (!fs.existsSync(manifestPath)) return res.json({ models: [] });
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const models = Array.isArray(data.models) ? data.models : [];
    res.json({ models: withAvatarStatus(models) });
  } catch (err) {
    res.status(500).json({ error: err.message || "avatar_models_failed" });
  }
});

app.post("/api/aika/avatar/import", upload.single("file"), (req, res) => {
  try {
    if (!req.file?.path) return res.status(400).json({ error: "file_required" });
    const models = importLive2DZip({ zipPath: req.file.path, webPublicDir });
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, models: withAvatarStatus(models) });
  } catch (err) {
    res.status(500).json({ error: err.message || "avatar_import_failed" });
  }
});

app.post("/api/aika/avatar/refresh", (_req, res) => {
  try {
    const manifestPath = path.join(live2dDir, "models.json");
    if (!fs.existsSync(live2dDir)) return res.json({ models: [] });
    const models = [];
    const ignored = new Set(["runtime", "__macosx"]);
    const dirs = fs
      .readdirSync(live2dDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !ignored.has(d.name.toLowerCase()));
    for (const dir of dirs) {
      const folder = path.join(live2dDir, dir.name);
      const modelFiles = fs.readdirSync(folder).filter(f => f.endsWith(".model3.json"));
      if (!modelFiles.length) continue;
      const modelFile = modelFiles[0];
      const thumb = path.join(folder, "thumb.png");
      if (!fs.existsSync(thumb)) {
        const png = fs.readdirSync(folder).find(f => f.toLowerCase().endsWith(".png"));
        if (png) fs.copyFileSync(path.join(folder, png), thumb);
      }
      models.push({
        id: dir.name,
        label: `${dir.name.replace(/_/g, " ")} (Local)`,
        modelUrl: `/assets/aika/live2d/${dir.name}/${modelFile}`,
        fallbackPng: "/assets/aika/live2d/placeholder.svg",
        thumbnail: `/assets/aika/live2d/${dir.name}/thumb.png`,
        source: "local_scan"
      });
    }
    fs.writeFileSync(manifestPath, JSON.stringify({ models }, null, 2));
    res.json({ models: withAvatarStatus(models) });
  } catch (err) {
    res.status(500).json({ error: err.message || "avatar_refresh_failed" });
  }
});

app.get("/api/aika/avatar/core", (_req, res) => {
  res.json({
    coreJs: fs.existsSync(live2dCoreJs),
    coreWasm: fs.existsSync(live2dCoreWasm),
    path: "/assets/aika/live2d/live2dcubismcore.js"
  });
});

app.post("/api/aika/avatar/core", upload.single("file"), (req, res) => {
  try {
    if (!req.file?.path) return res.status(400).json({ error: "file_required" });
    if (!fs.existsSync(live2dDir)) fs.mkdirSync(live2dDir, { recursive: true });
    const name = (req.file.originalname || "").toLowerCase();
    if (name.endsWith(".js")) {
      fs.copyFileSync(req.file.path, live2dCoreJs);
    } else if (name.endsWith(".wasm")) {
      fs.copyFileSync(req.file.path, live2dCoreWasm);
    } else {
      return res.status(400).json({ error: "core_file_must_be_js_or_wasm" });
    }
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, coreJs: fs.existsSync(live2dCoreJs), coreWasm: fs.existsSync(live2dCoreWasm) });
  } catch (err) {
    res.status(500).json({ error: err.message || "avatar_core_upload_failed" });
  }
});

app.post("/api/meetings/summary", async (req, res) => {
  try {
    const { title, transcript } = req.body || {};
    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({ error: "transcript_required" });
    }
    const meetingId = Date.now().toString(36);
    const safeTitle = typeof title === "string" && title.trim() ? title.trim() : `Meeting ${meetingId}`;
    const prompt = `You are a meeting assistant. Create a polished, shareable meeting summary from the transcript.\n\nTranscript:\n${transcript}\n\nReturn markdown with sections: Summary, Decisions, Action Items (with owners if possible), Key Details, Next Steps. Keep concise.`;
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      max_output_tokens: 500,
      input: [
        { role: "user", content: [{ type: "input_text", text: prompt }] }
      ]
    });
    const summaryText = extractResponseText(response) || "Summary unavailable.";
    const meetingDir = path.join(path.resolve(serverRoot, "..", "..", "data", "meetings"));
    if (!fs.existsSync(meetingDir)) fs.mkdirSync(meetingDir, { recursive: true });
    const filePath = path.join(meetingDir, `${meetingId}.md`);
    const doc = `# ${safeTitle}\n\n${summaryText}\n\n## Raw Transcript\n\n${transcript}`;
    fs.writeFileSync(filePath, doc);
    res.json({ ok: true, id: meetingId, title: safeTitle, docUrl: `/api/meetings/${meetingId}` });
  } catch (err) {
    res.status(500).json({ error: err.message || "meeting_summary_failed" });
  }
});

app.get("/api/meetings/:id", (req, res) => {
  const meetingDir = path.join(path.resolve(serverRoot, "..", "..", "data", "meetings"));
  const filePath = path.join(meetingDir, `${req.params.id}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "not_found" });
  res.type("text/markdown").send(fs.readFileSync(filePath, "utf-8"));
});

// Meeting Copilot recordings
function getRecordingAudioUrl(recordingId, recording) {
  if (recording?.storage_url) return recording.storage_url;
  return `/api/recordings/${recordingId}/audio`;
}

function formatStamp(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildTranscriptText(recording) {
  const segments = recording?.transcript_json?.segments;
  if (Array.isArray(segments) && segments.length) {
    return segments
      .map(seg => {
        const start = formatStamp(seg.start);
        const end = formatStamp(seg.end);
        const speaker = seg.speaker || "Speaker";
        return `[${start}-${end}] ${speaker}: ${seg.text || ""}`.trim();
      })
      .join("\n");
  }
  return recording?.transcript_text || "";
}

function buildMeetingNotesMarkdown(recording) {
  const title = recording?.title || "Meeting";
  const started = recording?.started_at ? new Date(recording.started_at).toLocaleString() : "Unknown";
  const ended = recording?.ended_at ? new Date(recording.ended_at).toLocaleString() : "Unknown";
  const duration = recording?.duration ? `${recording.duration}s` : "Unknown";
  const summary = recording?.summary_json || {};
  const decisions = recording?.decisions_json || summary.decisions || [];
  const tasks = recording?.tasks_json || summary.actionItems || [];
  const risks = recording?.risks_json || summary.risks || [];
  const nextSteps = recording?.next_steps_json || summary.nextSteps || [];
  const overview = summary.overview || [];
  const tldr = summary.tldr || "";
  const attendees = summary.attendees || [];
  const discussionPoints = summary.discussionPoints || [];
  const nextMeeting = summary.nextMeeting || {};
  const transcriptText = buildTranscriptText(recording);
  return [
    `# ${title}`,
    "",
    "## Meeting Info",
    `- Start: ${started}`,
    `- End: ${ended}`,
    `- Duration: ${duration}`,
    `- Workspace: ${recording?.workspace_id || "default"}`,
    `- Created by: ${recording?.created_by || "local"}`,
    "",
    "## ⚡ TL;DR / Executive Summary",
    tldr || (overview.length ? overview.slice(0, 2).join(" ") : "Summary pending."),
    "",
    "## Attendees",
    attendees.length ? attendees.map(a => `- ${a}`).join("\n") : "- Not captured.",
    "",
    "## Decisions",
    decisions.length ? decisions.map(item => `- ${item}`).join("\n") : "- None captured.",
    "",
    "## Action Items / Tasks",
    tasks.length
      ? tasks.map(item => {
          const task = item.task || item.title || item.text || "";
          const owner = item.owner || "Unassigned";
          const due = item.due ? `, Due: ${item.due}` : "";
          return `- ${task} (Owner: ${owner}${due})`;
        }).join("\n")
      : "- None captured.",
    "",
    "## Risks",
    risks.length ? risks.map(item => `- ${item}`).join("\n") : "- None captured.",
    "",
    "## 💡 Key Discussion Points/Insights",
    discussionPoints.length
      ? discussionPoints.map(p => `- ${p.topic || "Discussion"}: ${p.summary || ""}`).join("\n")
      : "- Not captured.",
    "",
    "## 📅 Next Steps/Follow-up",
    nextSteps.length ? nextSteps.map(item => `- ${item}`).join("\n") : "- Follow up to confirm next steps.",
    nextMeeting?.date || nextMeeting?.goal
      ? `Next meeting: ${nextMeeting.date || "TBD"} — ${nextMeeting.goal || "TBD"}`
      : "",
    "",
    "## Transcript (Timestamped)",
    transcriptText || "Transcript not available yet."
  ].join("\n");
}

app.post("/api/recordings/start", (req, res) => {
  try {
    const { title, redactionEnabled, retentionDays } = req.body || {};
    const retentionWindow = Number(retentionDays || process.env.RECORDING_RETENTION_DAYS || 30);
    const retentionExpiresAt = retentionWindow
      ? new Date(Date.now() + retentionWindow * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const recording = createRecording({
      title,
      redactionEnabled: Boolean(redactionEnabled),
      workspaceId: getWorkspaceId(req),
      createdBy: getUserId(req),
      retentionExpiresAt
    });
    res.json({
      ok: true,
      recording: {
        id: recording.id,
        title: recording.title,
        startedAt: recording.startedAt,
        retentionExpiresAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "recording_start_failed" });
  }
});

app.post("/api/recordings/:id/chunk", recordingUpload.single("chunk"), (req, res) => {
  try {
    const recording = getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: "recording_not_found" });
    if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
    const seq = Number(req.query.seq || req.body?.seq || 0);
    if (!req.file?.path) return res.status(400).json({ error: "chunk_missing" });
    addRecordingChunk({ recordingId: recording.id, seq, storagePath: req.file.path });
    res.json({ ok: true, seq });
  } catch (err) {
    res.status(500).json({ error: err?.message || "recording_chunk_failed" });
  }
});

app.post("/api/recordings/:id/pause", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  updateRecording(recording.id, { status: "paused" });
  updateProcessingState(recording.id, { stage: "paused" });
  res.json({ ok: true });
});

app.post("/api/recordings/:id/resume", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  updateRecording(recording.id, { status: "recording" });
  updateProcessingState(recording.id, { stage: "recording" });
  res.json({ ok: true });
});

app.post("/api/recordings/:id/stop", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  const { durationSec } = req.body || {};
  const endedAt = new Date().toISOString();
  const audioPath = combineChunks(recording.id, recordingsDir);
  const updates = {
    ended_at: endedAt,
    duration: durationSec ? Math.round(Number(durationSec)) : null,
    status: "processing"
  };
  if (audioPath) {
    updates.storage_path = audioPath;
    updates.storage_url = `/api/recordings/${recording.id}/audio`;
  }
  updateRecording(recording.id, updates);
  updateProcessingState(recording.id, { stage: "processing", endedAt });
  setTimeout(() => {
    processRecordingPipeline(recording.id, { createArtifacts: true }).catch(err => {
      console.error("Recording pipeline failed:", err);
      updateRecording(recording.id, { status: "failed" });
    });
  }, 100);
  res.json({ ok: true, id: recording.id, audioUrl: updates.storage_url || null });
});

app.get("/api/recordings", (req, res) => {
  try {
    const list = listRecordings({
      workspaceId: getWorkspaceId(req),
      status: String(req.query.status || ""),
      query: String(req.query.q || ""),
      limit: Number(req.query.limit || 50)
    });
    const now = Date.now();
    const filtered = list.filter(row => canAccessRecording(req, row)).map(row => {
      if (row.retention_expires_at && Date.parse(row.retention_expires_at) < now) {
        return { ...row, status: "expired", audioUrl: getRecordingAudioUrl(row.id, row) };
      }
      return { ...row, audioUrl: getRecordingAudioUrl(row.id, row) };
    });
    res.json({ recordings: filtered });
  } catch (err) {
    res.status(500).json({ error: err?.message || "recordings_list_failed" });
  }
});

app.get("/api/recordings/:id", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  res.json({
    recording: {
      ...recording,
      audioUrl: getRecordingAudioUrl(recording.id, recording)
    },
    chunks: listRecordingChunks(recording.id),
    actions: listAgentActions(recording.id)
  });
});

app.post("/api/recordings/:id/tasks", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  const { tasks } = req.body || {};
  if (!Array.isArray(tasks)) return res.status(400).json({ error: "tasks_array_required" });
  updateRecording(recording.id, { tasks_json: JSON.stringify(tasks) });
  const updated = getRecording(recording.id);
  res.json({ recording: updated });
});

app.get("/api/recordings/:id/audio", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  if (!recording.storage_path || !fs.existsSync(recording.storage_path)) {
    return res.status(404).json({ error: "audio_not_found" });
  }
  res.type("audio/webm").sendFile(recording.storage_path);
});

app.post("/api/stt/transcribe", sttUpload.single("audio"), async (req, res) => {
  try {
    if (!req.file?.path) return res.status(400).json({ error: "audio_required" });
    const result = await transcribeAudio(req.file.path);
    if (result?.error) {
      return res.status(400).json({ error: result.error, provider: result.provider || "unknown" });
    }
    res.json({ text: result.text || "", provider: result.provider || "unknown" });
  } catch (err) {
    res.status(500).json({ error: err?.message || "stt_failed" });
  } finally {
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
  }
});

app.get("/api/recordings/:id/transcript", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  const transcriptText = buildTranscriptText(recording);
  if (!transcriptText) return res.status(404).json({ error: "transcript_not_ready" });
  const filePath = writeArtifact(recording.id, "transcript.txt", transcriptText);
  res.type("text/plain").sendFile(filePath);
});

app.get("/api/recordings/:id/notes", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  const notes = buildMeetingNotesMarkdown(recording);
  const filePath = writeArtifact(recording.id, "meeting_notes.md", notes);
  res.type("text/markdown").sendFile(filePath);
});

app.get("/api/recordings/:id/export", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  const notes = buildMeetingNotesMarkdown(recording);
  const transcriptText = buildTranscriptText(recording);
  const notesPath = writeArtifact(recording.id, "meeting_notes.md", notes);
  const transcriptPath = writeArtifact(recording.id, "transcript.txt", transcriptText || "");
  res.json({
    ok: true,
    notesUrl: `/api/recordings/${recording.id}/notes`,
    transcriptUrl: `/api/recordings/${recording.id}/transcript`,
    audioUrl: getRecordingAudioUrl(recording.id, recording),
    notesPath,
    transcriptPath
  });
});

app.delete("/api/recordings/:id", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  deleteAgentActionsForRecording(recording.id);
  deleteMemoryEntitiesForRecording(recording.id);
  deleteRecording(recording.id);
  res.json({ ok: true, id: recording.id });
});

app.post("/api/recordings/:id/ask", async (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "question_required" });
  if (!process.env.OPENAI_API_KEY) {
    const excerpt = (recording.transcript_text || "").slice(0, 600);
    return res.json({ answer: `Here's what I found in the transcript:\n${excerpt || "Transcript not available yet."}` });
  }
  try {
    const prompt = `Answer the question using only this meeting transcript and summary.\n\nTranscript:\n${recording.transcript_text || ""}\n\nSummary:\n${JSON.stringify(recording.summary_json || {}, null, 2)}\n\nQuestion: ${question}`;
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: 500
    });
    const answer = extractResponseText(response) || "No answer generated.";
    res.json({ answer: recording.redaction_enabled ? redactText(answer) : answer });
  } catch (err) {
    res.status(500).json({ error: err?.message || "recording_ask_failed" });
  }
});

app.post("/api/memory/ask", async (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "question_required" });
  const entities = searchMemoryEntities({ workspaceId: getWorkspaceId(req), query: question, limit: 20 });
  if (!process.env.OPENAI_API_KEY) {
    const summary = entities.map(e => `${e.type}: ${e.value}`).join("\n");
    return res.json({ answer: summary || "No related meetings found yet.", entities });
  }
  try {
    const prompt = `Answer the question using only the structured memory entities below.\n\nEntities:\n${JSON.stringify(entities, null, 2)}\n\nQuestion: ${question}`;
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: 400
    });
    const answer = extractResponseText(response) || "No answer generated.";
    res.json({ answer, entities });
  } catch (err) {
    res.status(500).json({ error: err?.message || "memory_ask_failed" });
  }
});

app.post("/api/recordings/:id/actions", async (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  const { actionType, input } = req.body || {};
  if (!actionType) return res.status(400).json({ error: "action_type_required" });
  let output = {};
  let status = "draft";
  try {
    if (actionType === "schedule_followup") {
      const fallback = {
        summary: input?.summary || `Follow-up for ${recording.title}`,
        startISO: input?.startISO,
        endISO: input?.endISO,
        description: input?.description || "Follow-up meeting generated by Aika."
      };
      try {
        const event = await createCalendarEvent(fallback);
        output = { event, provider: "google" };
        status = "completed";
      } catch {
        output = { draft: fallback, provider: "draft" };
      }
    } else if (actionType === "draft_email") {
      const body = [
        `Subject: Recap - ${recording.title}`,
        "",
        "Summary:",
        ...(recording.summary_json?.overview || []),
        "",
        "Decisions:",
        ...(recording.summary_json?.decisions || []),
        "",
        "Action Items:",
        ...(recording.summary_json?.actionItems || []).map(a => `- ${a.task} (${a.owner || "Unassigned"})`)
      ].join("\n");
      output = { draft: body };
      status = "completed";
    } else if (actionType === "create_doc") {
      const markdown = (recording.summary_json && JSON.stringify(recording.summary_json, null, 2)) || "";
      try {
        const doc = await createGoogleDoc(`${recording.title} Recap`, markdown);
        const url = doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}/edit` : null;
        output = { docId: doc.documentId, url };
        status = "completed";
      } catch {
        const filePath = writeArtifact(recording.id, "recap.md", markdown);
        output = { localPath: filePath };
      }
    } else if (actionType === "create_task") {
      output = { task: input || { title: "Follow up", owner: "Unassigned" }, provider: "draft" };
      status = "completed";
    } else if (actionType === "create_ticket") {
      output = { ticket: input || { title: "Follow up ticket" }, provider: "draft" };
      status = "completed";
    } else {
      output = { note: "Action type not implemented yet." };
    }
  } catch (err) {
    output = { error: err?.message || "action_failed" };
    status = "failed";
  }

  const action = createAgentAction({
    workspaceId: recording.workspace_id || "default",
    recordingId: recording.id,
    requestedBy: getUserId(req),
    actionType,
    input,
    output,
    status
  });
  res.json({ action });
});

app.get("/api/aika/config", (_req, res) => {
  const cfg = readAikaConfig();
  res.json(cfg);
});

app.get("/api/integrations", (_req, res) => {
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const firefliesConfigured = Boolean(process.env.FIREFLIES_API_KEY);
  const plexConfigured = Boolean(process.env.PLEX_URL && process.env.PLEX_TOKEN);
  const amazonConfigured = Boolean(process.env.AMAZON_ACCESS_KEY && process.env.AMAZON_SECRET_KEY);
  const walmartConfigured = Boolean(process.env.WALMART_CLIENT_ID && process.env.WALMART_CLIENT_SECRET);
  const slackConfigured = Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
  const discordConfigured = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const facebookConfigured = Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  const instagramConfigured = Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
  const whatsappConfigured = Boolean(process.env.WHATSAPP_APP_ID && process.env.WHATSAPP_APP_SECRET);
  res.json({
    integrations: {
      ...integrationsState,
      google_docs: { ...integrationsState.google_docs, configured: googleConfigured },
      google_drive: { ...integrationsState.google_drive, configured: googleConfigured },
      fireflies: { ...integrationsState.fireflies, configured: firefliesConfigured },
      amazon: { ...integrationsState.amazon, configured: amazonConfigured },
      walmart: { ...integrationsState.walmart, configured: walmartConfigured },
      plex: { ...integrationsState.plex, configured: plexConfigured },
      slack: { ...integrationsState.slack, configured: slackConfigured },
      discord: { ...integrationsState.discord, configured: discordConfigured },
      telegram: { ...integrationsState.telegram, configured: telegramConfigured },
      facebook: { ...integrationsState.facebook, configured: facebookConfigured },
      instagram: { ...integrationsState.instagram, configured: instagramConfigured },
      whatsapp: { ...integrationsState.whatsapp, configured: whatsappConfigured }
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
  const engine = getDefaultTtsEngine();
  let gptsovitsOnline = false;
  let gptsovitsStatus = null;
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
    gptsovitsOnline = r.ok;
    gptsovitsStatus = r.status;
  } catch {
    gptsovitsOnline = false;
  }
  const piperBin = process.env.PIPER_PYTHON_BIN;
  const piperVoicesDir = process.env.PIPER_VOICES_DIR
    ? path.resolve(process.env.PIPER_VOICES_DIR)
    : path.resolve(serverRoot, "piper_voices");
  let piperVoices = 0;
  try {
    if (fs.existsSync(piperVoicesDir)) {
      piperVoices = fs.readdirSync(piperVoicesDir).filter(f => f.endsWith(".onnx")).length;
    }
  } catch {
    piperVoices = 0;
  }

  res.json({
    server: { ok: true, uptimeSec: Math.floor(process.uptime()) },
    tts: {
      engine,
      selected: engine,
      engines: {
        gptsovits: { enabled: engine === "gptsovits", online: gptsovitsOnline, status: gptsovitsStatus },
        piper: { enabled: engine === "piper", ready: Boolean(piperBin) && piperVoices > 0, voices: piperVoices }
      }
    },
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

// MCP-lite Tool Control Plane
app.get("/api/tools", rateLimit, (_req, res) => {
  res.json({ tools: registry.list() });
});

app.get("/api/tools/:name", rateLimit, (req, res) => {
  const tool = registry.get(req.params.name);
  if (!tool) return res.status(404).json({ error: "tool_not_found" });
  res.json({ tool: tool.def });
});

app.get("/api/tools/history", rateLimit, (req, res) => {
  const limit = Number(req.query.limit || 50);
  res.json({ history: listToolHistory(limit) });
});

app.post("/api/tools/call", rateLimit, async (req, res) => {
  const { name, params, context } = req.body || {};
  if (!name) return res.status(400).json({ error: "tool_name_required" });
  try {
    const result = await executor.callTool({
      name,
      params,
      context: {
        ...(context || {}),
        userId: context?.userId || req.headers["x-user-id"] || req.ip,
        correlationId: context?.correlationId || req.headers["x-correlation-id"] || ""
      }
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "tool_call_failed" });
  }
});

app.post("/api/approvals", rateLimit, async (req, res) => {
  const { toolName, params, humanSummary, riskLevel, correlationId } = req.body || {};
  if (!toolName) return res.status(400).json({ error: "tool_name_required" });
  try {
    const redactedParams = JSON.parse(redactPhi(JSON.stringify(params || {})) || "{}");
    const request = {
      toolName,
      params: redactedParams,
      humanSummary: humanSummary || `Request to run ${toolName}`,
      riskLevel: riskLevel || "medium",
      createdBy: req.headers["x-user-id"] || req.ip,
      correlationId: correlationId || req.headers["x-correlation-id"] || ""
    };
    const { createApproval } = await import("./mcp/approvals.js");
    const approval = createApproval(request);
    res.json({ approval });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_create_failed" });
  }
});

app.get("/api/approvals", rateLimit, (_req, res) => {
  res.json({ approvals: listApprovals() });
});

app.post("/api/approvals/:id/approve", rateLimit, (req, res) => {
  try {
    const approved = executor.approve(req.params.id, req.headers["x-user-id"] || req.ip);
    res.json({ approval: approved });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_failed" });
  }
});

app.post("/api/approvals/:id/deny", rateLimit, (req, res) => {
  try {
    const denied = denyApproval(req.params.id, req.headers["x-user-id"] || req.ip);
    if (!denied) return res.status(404).json({ error: "approval_not_found" });
    res.json({ approval: denied });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_deny_failed" });
  }
});

app.post("/api/approvals/:id/execute", rateLimit, async (req, res) => {
  try {
    const { token, context } = req.body || {};
    const result = await executor.execute(req.params.id, token, {
      ...(context || {}),
      userId: context?.userId || req.headers["x-user-id"] || req.ip
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_execute_failed" });
  }
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

app.get("/api/integrations/google/connect", (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).send("google_oauth_not_configured");
    }
    const preset = String(req.query.preset || "core");
    const url = connectGoogle(preset);
    res.redirect(url);
  } catch (err) {
    res.status(500).send(err.message || "google_auth_failed");
  }
});

app.get("/api/integrations/google/auth/start", (req, res) => {
  res.redirect(`/api/integrations/google/connect?preset=${encodeURIComponent(String(req.query.preset || "core"))}`);
});

app.get("/api/integrations/slack/connect", (_req, res) => {
  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
    return res.status(400).send("slack_oauth_not_configured");
  }
  const redirectUri = process.env.SLACK_REDIRECT_URI || `${getBaseUrl()}/api/integrations/slack/callback`;
  const scopes = process.env.SLACK_SCOPES || "chat:write,channels:read,users:read";
  const state = createOAuthState("slack");
  const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(process.env.SLACK_CLIENT_ID)}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  res.redirect(url);
});

app.get("/api/integrations/slack/callback", async (req, res) => {
  try {
    const { code, state } = req.query || {};
    validateOAuthState("slack", String(state || ""));
    const redirectUri = process.env.SLACK_REDIRECT_URI || `${getBaseUrl()}/api/integrations/slack/callback`;
    const body = encodeForm({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    });
    const r = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || "slack_oauth_failed");
    setProvider("slack", {
      access_token: data.access_token,
      bot_token: data.access_token,
      team: data.team || null,
      authed_user: data.authed_user || null,
      connectedAt: new Date().toISOString()
    });
    integrationsState.slack.connected = true;
    integrationsState.slack.connectedAt = new Date().toISOString();
    res.redirect(`${getUiBaseUrl()}/?integration=slack&status=success`);
  } catch (err) {
    res.redirect(`${getUiBaseUrl()}/?integration=slack&status=error`);
  }
});

app.post("/api/integrations/slack/disconnect", (_req, res) => {
  setProvider("slack", null);
  integrationsState.slack.connected = false;
  delete integrationsState.slack.connectedAt;
  res.json({ ok: true });
});

app.get("/api/integrations/discord/connect", (_req, res) => {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    return res.status(400).send("discord_oauth_not_configured");
  }
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${getBaseUrl()}/api/integrations/discord/callback`;
  const scopes = process.env.DISCORD_SCOPES || "identify";
  const state = createOAuthState("discord");
  const url = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(process.env.DISCORD_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
  res.redirect(url);
});

app.get("/api/integrations/discord/callback", async (req, res) => {
  try {
    const { code, state } = req.query || {};
    validateOAuthState("discord", String(state || ""));
    const redirectUri = process.env.DISCORD_REDIRECT_URI || `${getBaseUrl()}/api/integrations/discord/callback`;
    const body = encodeForm({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });
    const r = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = await r.json();
    if (!data.access_token) throw new Error(data.error_description || "discord_oauth_failed");
    setProvider("discord", {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_in: data.expires_in || null,
      scope: data.scope || null,
      token_type: data.token_type || null,
      connectedAt: new Date().toISOString()
    });
    integrationsState.discord.connected = true;
    integrationsState.discord.connectedAt = new Date().toISOString();
    res.redirect(`${getUiBaseUrl()}/?integration=discord&status=success`);
  } catch (err) {
    res.redirect(`${getUiBaseUrl()}/?integration=discord&status=error`);
  }
});

app.post("/api/integrations/discord/disconnect", (_req, res) => {
  setProvider("discord", null);
  integrationsState.discord.connected = false;
  delete integrationsState.discord.connectedAt;
  res.json({ ok: true });
});

app.get("/api/integrations/amazon/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "query_required" });
  searchAmazonItems({ keywords: q })
    .then(data => res.json({ results: data.items || [], raw: data.raw || null }))
    .catch(err => res.status(500).json({ error: err?.message || "amazon_paapi_failed" }));
});

app.get("/api/integrations/meta/connect", (req, res) => {
  try {
    const product = String(req.query.product || "facebook");
    const state = createOAuthState(`meta_${product}`);
    const url = buildMetaAuthUrl(product, state);
    res.redirect(url);
  } catch (err) {
    res.status(400).send(err?.message || "meta_oauth_failed");
  }
});

app.get("/api/integrations/meta/callback", async (req, res) => {
  try {
    const { code, state, product } = req.query || {};
    const key = `meta_${String(product || "facebook")}`;
    validateOAuthState(key, String(state || ""));
    const token = await exchangeMetaCode({ code: String(code || ""), product: String(product || "facebook") });
    storeMetaToken(String(product || "facebook"), token);
    integrationsState.facebook.connected = true;
    integrationsState.facebook.connectedAt = new Date().toISOString();
    res.redirect(`${getUiBaseUrl()}/?integration=meta&status=success`);
  } catch (err) {
    res.redirect(`${getUiBaseUrl()}/?integration=meta&status=error`);
  }
});

app.post("/api/integrations/meta/disconnect", (_req, res) => {
  setProvider("meta", null);
  integrationsState.facebook.connected = false;
  integrationsState.instagram.connected = false;
  integrationsState.whatsapp.connected = false;
  res.json({ ok: true });
});

app.get("/api/integrations/facebook/profile", async (_req, res) => {
  const token = getMetaToken("facebook");
  if (!token) return res.status(400).json({ error: "facebook_not_connected" });
  const r = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${encodeURIComponent(token)}`);
  const data = await r.json();
  if (data.error) return res.status(500).json({ error: data.error.message || "facebook_profile_failed" });
  res.json(data);
});

app.get("/api/integrations/facebook/posts", async (_req, res) => {
  const token = getMetaToken("facebook");
  if (!token) return res.status(400).json({ error: "facebook_not_connected" });
  const r = await fetch(`https://graph.facebook.com/v19.0/me/posts?limit=10&access_token=${encodeURIComponent(token)}`);
  const data = await r.json();
  if (data.error) return res.status(500).json({ error: data.error.message || "facebook_posts_failed" });
  res.json(data);
});

app.get("/api/integrations/amazon/auth/start", (_req, res) => {
  res.status(400).send("amazon_oauth_not_supported_use_paapi_keys");
});

app.get("/api/integrations/walmart/auth/start", (_req, res) => {
  if (!process.env.WALMART_CLIENT_ID || !process.env.WALMART_CLIENT_SECRET) {
    return res.status(400).send("walmart_oauth_not_configured");
  }
  res.send("walmart_oauth_placeholder");
});

app.get("/api/integrations/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) return res.status(400).send("missing_code_or_state");
    const token = await exchangeGoogleCode(String(code), String(state));
    integrationsState.google_docs.connected = true;
    integrationsState.google_drive.connected = true;
    integrationsState.google_docs.connectedAt = new Date().toISOString();
    integrationsState.google_drive.connectedAt = new Date().toISOString();
    // store token in persistent store
    await (async () => {
      const { setProvider } = await import("./integrations/store.js");
      const existing = getProvider("google") || {};
      let email = null;
      try {
        const info = await fetchGoogleUserInfo(token.access_token);
        email = info?.email || null;
      } catch {
        // ignore userinfo errors
      }
      setProvider("google", {
        ...existing,
        ...token,
        refresh_token: token.refresh_token || existing.refresh_token,
        scope: token.scope || existing.scope,
        email: email || existing.email,
        connectedAt: new Date().toISOString()
      });
    })();
    const uiBase = process.env.WEB_UI_URL || "http://localhost:3000";
    res.redirect(`${uiBase}/?integration=google&status=success`);
  } catch (err) {
    const uiBase = process.env.WEB_UI_URL || "http://localhost:3000";
    res.redirect(`${uiBase}/?integration=google&status=error`);
  }
});

app.get("/api/integrations/google/status", async (_req, res) => {
  try {
    const status = getGoogleStatus();
    res.json({ ok: status.connected, ...status });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || "google_not_connected" });
  }
});

app.post("/api/integrations/google/disconnect", async (_req, res) => {
  try {
    const result = await disconnectGoogle();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "google_disconnect_failed" });
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

app.get("/api/integrations/google/drive/list", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const data = await listDriveFiles("trashed=false", limit);
    res.json({ files: data.files || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_drive_list_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/docs/get", async (req, res) => {
  try {
    const docId = req.query.docId;
    if (!docId) return res.status(400).json({ error: "docId_required" });
    const doc = await getGoogleDoc(String(docId));
    const title = doc?.title || "";
    const text = (doc?.body?.content || [])
      .map(c => c.paragraph?.elements?.map(e => e.textRun?.content || "").join("") || "")
      .join("")
      .slice(0, 2000);
    res.json({ title, text });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_docs_get_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/sheets/get", async (req, res) => {
  try {
    const spreadsheetId = req.query.spreadsheetId;
    const range = req.query.range;
    if (!spreadsheetId || !range) return res.status(400).json({ error: "spreadsheetId_and_range_required" });
    const data = await getSheetValues(String(spreadsheetId), String(range));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_sheets_get_failed", detail: err.detail || null });
  }
});

app.post("/api/integrations/google/sheets/append", async (req, res) => {
  try {
    const { spreadsheetId, range, values } = req.body || {};
    if (!spreadsheetId || !range || !Array.isArray(values)) {
      return res.status(400).json({ error: "spreadsheetId_range_values_required" });
    }
    const data = await appendSheetValues(String(spreadsheetId), String(range), values);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_sheets_append_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/calendar/next", async (req, res) => {
  try {
    const max = Number(req.query.max || 10);
    const data = await listCalendarEvents(max);
    res.json({ events: data.items || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_calendar_list_failed", detail: err.detail || null });
  }
});

app.post("/api/integrations/google/calendar/create", async (req, res) => {
  try {
    const { summary, startISO, endISO, description, location } = req.body || {};
    if (!summary || !startISO || !endISO) return res.status(400).json({ error: "summary_start_end_required" });
    const payload = {
      summary,
      start: { dateTime: startISO },
      end: { dateTime: endISO }
    };
    if (description) payload.description = description;
    if (location) payload.location = location;
    const data = await createCalendarEvent(payload);
    res.json({ event: data });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_calendar_create_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/slides/get", async (req, res) => {
  try {
    const presentationId = req.query.presentationId;
    if (!presentationId) return res.status(400).json({ error: "presentationId_required" });
    const data = await getSlidesPresentation(String(presentationId));
    res.json({ title: data.title, slideCount: (data.slides || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_slides_get_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/meet/spaces", async (_req, res) => {
  try {
    const data = await listMeetSpaces();
    res.json({ spaces: data.spaces || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_meet_list_failed", detail: err.detail || null });
  }
});

app.post("/api/integrations/google/meet/spaces", async (req, res) => {
  try {
    const data = await createMeetSpace(req.body || {});
    res.json({ space: data });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_meet_create_failed", detail: err.detail || null });
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

app.post("/api/agent/task", rateLimit, async (req, res) => {
  const { type, payload } = req.body || {};
  const toolMap = {
    plex_identity: "integrations.plexIdentity",
    fireflies_transcripts: "integrations.firefliesTranscripts",
    slack_post: "messaging.slackPost",
    telegram_send: "messaging.telegramSend",
    discord_send: "messaging.discordSend"
  };
  const toolName = toolMap[type];
  if (!toolName) return res.status(400).json({ error: "unknown_task" });
  try {
    const result = await executor.callTool({
      name: toolName,
      params: payload || {},
      context: { userId: req.headers["x-user-id"] || req.ip, source: "agent", correlationId: req.headers["x-correlation-id"] || "" }
    });
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "agent_task_failed" });
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
