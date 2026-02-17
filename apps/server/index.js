import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
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
  fetchGoogleUserInfo,
  sendGmailMessage
} from "./integrations/google.js";
import {
  fetchFirefliesTranscripts,
  fetchFirefliesTranscript,
  uploadFirefliesAudio,
  markFirefliesConnected
} from "./integrations/fireflies.js";
import { fetchPlexIdentity } from "./integrations/plex.js";
import { sendSlackMessage, sendTelegramMessage, sendDiscordMessage, sendWhatsAppMessage, sendSmsMessage } from "./integrations/messaging.js";
import { startDiscordBot } from "./integrations/discord_bot.js";
import { handleInboundMessage } from "./integrations/inbound.js";
import { fetchCurrentWeather } from "./integrations/weather.js";
import { searchWeb } from "./integrations/web_search.js";
import { buildAmazonAddToCartUrl, runProductResearch } from "./integrations/product_research.js";
import { getProvider, setProvider } from "./integrations/store.js";
import { searchAmazonItems } from "./integrations/amazon_paapi.js";
import { buildMetaAuthUrl, exchangeMetaCode, getMetaToken, storeMetaToken } from "./integrations/meta.js";
import { buildCoinbaseAuthUrl, exchangeCoinbaseCode, normalizeCoinbaseScopes, revokeCoinbaseToken } from "./integrations/coinbase.js";
import { registry, executor } from "./mcp/index.js";
import { redactPhi } from "./mcp/policy.js";
import { listApprovals, denyApproval } from "./mcp/approvals.js";
import { writeAudit } from "./mcp/audit.js";
import { listToolHistory } from "./storage/history.js";
import { initDb } from "./storage/db.js";
import { runMigrations } from "./storage/schema.js";
import { getSession, createSession, setSessionCookie, clearSessionCookie, destroySession } from "./auth/session.js";
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
import { writeOutbox } from "./storage/outbox.js";
import { listPairings, approvePairing, denyPairing } from "./storage/pairings.js";
import { getThread, listThreadMessages, appendThreadMessage } from "./storage/threads.js";
import { getRuntimeFlags, setRuntimeFlag } from "./storage/runtime_flags.js";
import { getAssistantProfile, updateAssistantProfile } from "./storage/assistant_profile.js";
import { listAssistantTasks, createAssistantTask, updateAssistantTask } from "./storage/assistant_tasks.js";
import { listAssistantProposals, createAssistantProposal, updateAssistantProposal, getAssistantProposal } from "./storage/assistant_change_proposals.js";
import { combineChunks, transcribeAudio, summarizeTranscript, extractEntities, splitAudioForTranscription } from "./recordings/processor.js";
import { redactStructured, redactText } from "./recordings/redaction.js";
import { runVoiceFullTest } from "./voice_tests/fulltest_runner.js";
import { initRagStore, getRagCounts, listMeetings, getVectorStoreStatus, getFirefliesGraph, getFirefliesNodeDetails } from "./src/rag/vectorStore.js";
import { listRagModels, createRagModel } from "./src/rag/collections.js";
import { syncFireflies, startFirefliesSyncLoop, getFirefliesSyncStatus, queueFirefliesSync } from "./src/rag/firefliesIngest.js";
import { answerRagQuestionRouted } from "./src/rag/router.js";
import { recordFeedback } from "./src/feedback/feedback.js";
import { startDailyPicksLoop, runDailyPicksEmail, generateDailyPicks, rescheduleDailyPicksLoop } from "./src/trading/dailyPicks.js";
import { createAlpacaTradeStream } from "./src/trading/alpacaStream.js";
import { recordMemoryToRag } from "./src/rag/memoryIngest.js";
import { indexRecordingToRag } from "./src/rag/recordingsIngest.js";
import { parseNotifyChannels, sendMeetingNotifications } from "./src/notifications/meetingNotifications.js";
import {
  syncTradingSources,
  crawlTradingSources,
  ingestTradingHowTo,
  ingestTradingDocument,
  ingestTradingUrl,
  ingestTradingFile,
  queryTradingKnowledge,
  recordTradeAnalysis,
  startTradingKnowledgeSyncLoop,
  ensureTradingSourcesSeeded,
  ensureTradingKnowledgeSeeded,
  listTradingKnowledge,
  getTradingKnowledgeStats,
  getTradingKnowledgeNodeDetails,
  listTradingSourcesUi,
  addTradingSource,
  updateTradingSourceUi,
  removeTradingSource,
  queueTradingSourceCrawl
} from "./src/trading/knowledgeRag.js";
import {
  crawlTradingRssSources,
  startTradingRssLoop,
  ensureTradingRssSeeded,
  listTradingRssSourcesUi,
  addTradingRssSource,
  updateTradingRssSourceUi,
  removeTradingRssSource,
  seedRssSourcesFromFeedspot,
  listTradingRssItemsUi
} from "./src/trading/rssIngest.js";
import {
  runSignalsIngestion,
  startSignalsScheduler,
  getSignalsStatus,
  listSignals,
  listSignalsTrends,
  getSignalDoc
} from "./src/signals/index.js";
import {
  startTradingYoutubeLoop,
  crawlTradingYoutubeSources,
  listTradingYoutubeSourcesUi,
  addTradingYoutubeSource,
  updateTradingYoutubeSourceUi,
  removeTradingYoutubeSource,
  discoverTradingYoutubeChannels
} from "./src/trading/youtubeIngest.js";
import { runTradingScenario, listTradingScenarios, getScenarioDetail } from "./src/trading/scenarios.js";
import { searchSymbols } from "./src/trading/symbolSearch.js";
import { buildRecommendationDetail } from "./src/trading/recommendationDetail.js";
import { buildLongTermSignal } from "./src/trading/signalEngine.js";
import { getPolicy, savePolicy, reloadPolicy, getPolicyMeta } from "./src/safety/policyLoader.js";
import { executeAction } from "./src/safety/executeAction.js";
import { listAuditEvents, verifyAuditChain } from "./src/safety/auditLog.js";
import { getKillSwitchState, setKillSwitch, isStopPhrase } from "./src/safety/killSwitch.js";
import { createSafetyApproval, listSafetyApprovals, approveSafetyApproval, rejectSafetyApproval } from "./src/safety/approvals.js";
import { planAction } from "./src/actionRunner/planner.js";
import { getActionRun } from "./src/actionRunner/runner.js";
import { getRunDir, getRunFilePath } from "./src/actionRunner/runStore.js";
import { listMacros, saveMacro, deleteMacro, getMacro, applyMacroParams, extractMacroParams } from "./src/actionRunner/macros.js";
import { listCanvasCards, upsertCanvasCard } from "./src/canvas/store.js";
import { listSkillVault, getSkillVaultEntry, scanSkillWithVirusTotal } from "./src/skillVault/registry.js";
import { startAssistantTasksLoop } from "./src/assistant/taskRunner.js";
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
import { getTradingSettings, updateTradingSettings, getTradingEmailSettings, getTradingTrainingSettings, getDefaultTradingUniverse } from "./storage/trading_settings.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf?.toString?.() || "";
  }
}));
app.use(express.urlencoded({ extended: false }));
app.use((req, _res, next) => {
  const session = getSession(req);
  req.aikaUser = session?.user || null;
  req.aikaSessionId = session?.id || null;
  next();
});
startReminderScheduler();
startDiscordBot();

initDb();
runMigrations();
try {
  initRagStore();
} catch (err) {
  console.warn("RAG init failed:", err?.message || err);
}
startFirefliesSyncLoop();
startDailyPicksLoop();
startTradingKnowledgeSyncLoop();
startTradingRssLoop();
startTradingYoutubeLoop();
startSignalsScheduler();
startAssistantTasksLoop();
const MONITOR_FLAG_KEY = "trading_recommendation_monitor";
let monitorInterval = null;
let monitorRunning = false;
startTradingRecommendationMonitor();

const rateMap = new Map();
let voiceFullTestState = {
  running: false,
  lastRunAt: null,
  report: null
};
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

function parseTagList(input) {
  if (Array.isArray(input)) {
    return input.map(item => String(item || "").trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input.split(/[;,]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

const serverRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const webPublicDir = path.resolve(serverRoot, "..", "web", "public");
const live2dDir = path.join(webPublicDir, "assets", "aika", "live2d");
const live2dCoreJs = path.join(live2dDir, "live2dcubismcore.js");
const live2dCoreWasm = path.join(live2dDir, "live2dcubismcore.wasm");
const uploadDir = path.resolve(serverRoot, "..", "..", "data", "_live2d_uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const tradingUploadDir = path.resolve(serverRoot, "..", "..", "data", "_trading_uploads");
if (!fs.existsSync(tradingUploadDir)) fs.mkdirSync(tradingUploadDir, { recursive: true });
const tradingUpload = multer({ dest: tradingUploadDir });
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
const recordingFinalUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const id = req.params.id;
      const dir = ensureRecordingDir(id);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const extFromName = path.extname(file.originalname || "").toLowerCase();
      const ext =
        extFromName ||
        (String(file.mimetype || "").includes("ogg")
          ? ".ogg"
          : String(file.mimetype || "").includes("wav")
            ? ".wav"
            : ".webm");
      cb(null, `recording${ext}`);
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

function addMemoryIndexed({ role, content, tags = "", source, occurredAt } = {}) {
  const memoryId = addMemory(db, { role, content, tags });
  if (!memoryId) return null;
  const sourceLabel = source || role || "memory";
  recordMemoryToRag({
    memoryId,
    content,
    tags,
    source: sourceLabel,
    occurredAt
  }).catch(() => {});
  return memoryId;
}

function buildIntegrationsState(userId = "") {
  const state = {
    google_docs: { connected: false },
    google_drive: { connected: false },
    fireflies: { connected: false },
    amazon: { connected: false },
    walmart: { connected: false },
    facebook: { connected: false },
    instagram: { connected: false },
    whatsapp: { connected: false },
    messages: { connected: false },
    telegram: { connected: false },
    slack: { connected: false },
    discord: { connected: false },
    plex: { connected: false },
    coinbase: { connected: false },
    robinhood: { connected: false }
  };
  const googleStored = getProvider("google", userId);
  if (googleStored) {
    state.google_docs.connected = true;
    state.google_drive.connected = true;
    state.google_docs.connectedAt = googleStored.connectedAt || new Date().toISOString();
    state.google_drive.connectedAt = googleStored.connectedAt || new Date().toISOString();
  }
  const slackStored = getProvider("slack", userId);
  if (slackStored?.access_token || slackStored?.bot_token) {
    state.slack.connected = true;
    state.slack.connectedAt = slackStored.connectedAt || new Date().toISOString();
  }
  const discordStored = getProvider("discord", userId);
  if (discordStored?.access_token || discordStored?.bot_token || discordStored?.webhook) {
    state.discord.connected = true;
    state.discord.connectedAt = discordStored.connectedAt || new Date().toISOString();
  }
  const telegramStored = getProvider("telegram", userId);
  if (telegramStored?.token) {
    state.telegram.connected = true;
    state.telegram.connectedAt = telegramStored.connectedAt || new Date().toISOString();
  }
  const whatsappConnected = Boolean(
    (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TO) ||
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_TO)
  );
  if (whatsappConnected) {
    state.whatsapp.connected = true;
    state.whatsapp.connectedAt = new Date().toISOString();
  }
  const smsConnected = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_SMS_FROM &&
    process.env.TWILIO_SMS_TO
  );
  if (smsConnected) {
    state.messages.connected = true;
    state.messages.connectedAt = new Date().toISOString();
  }
  const firefliesStored = getProvider("fireflies", userId);
  if (firefliesStored?.connected) {
    state.fireflies.connected = true;
    state.fireflies.connectedAt = firefliesStored.connectedAt || new Date().toISOString();
  }
  const plexStored = getProvider("plex", userId);
  if (plexStored?.connected) {
    state.plex.connected = true;
    state.plex.connectedAt = plexStored.connectedAt || new Date().toISOString();
  }
  const coinbaseStored = getProvider("coinbase", userId);
  if (coinbaseStored?.access_token || process.env.COINBASE_ACCESS_TOKEN) {
    state.coinbase.connected = true;
    state.coinbase.connectedAt = coinbaseStored?.connectedAt || new Date().toISOString();
  }
  const robinhoodStored = getProvider("robinhood", userId);
  if (robinhoodStored?.access_token || process.env.ROBINHOOD_ACCESS_TOKEN) {
    state.robinhood.connected = true;
    state.robinhood.connectedAt = robinhoodStored?.connectedAt || new Date().toISOString();
  }
  return state;
}

function buildConnections(userId = "") {
  const connections = [];
  const googleStored = getProvider("google", userId);
  const googleStatus = getGoogleStatus(userId);
  connections.push({
    id: "google",
    label: "Google (Gmail/Calendar/Drive)",
    detail: "Docs, Drive, Calendar, Gmail",
    status: googleStatus?.connected ? "connected" : "disconnected",
    scopes: googleStatus?.scopes || [],
    lastUsedAt: googleStored?.lastUsedAt || null,
    connectedAt: googleStored?.connectedAt || null,
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    method: "oauth",
    connectUrl: "/api/integrations/google/connect?preset=core",
    connectLabel: "Connect Google",
    setupHint: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/server/.env"
  });

  const slackStored = getProvider("slack", userId);
  connections.push({
    id: "slack",
    label: "Slack",
    detail: "Channels and messages",
    status: slackStored?.access_token || slackStored?.bot_token || process.env.SLACK_BOT_TOKEN ? "connected" : "disconnected",
    scopes: slackStored?.scope ? String(slackStored.scope).split(/\\s|,/).filter(Boolean) : [],
    lastUsedAt: slackStored?.lastUsedAt || null,
    connectedAt: slackStored?.connectedAt || null,
    configured: Boolean(process.env.SLACK_BOT_TOKEN || (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET)),
    method: "oauth",
    connectUrl: "/api/integrations/slack/connect",
    connectLabel: "Connect Slack",
    setupHint: "Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET (or SLACK_BOT_TOKEN)"
  });

  const discordStored = getProvider("discord", userId);
  connections.push({
    id: "discord",
    label: "Discord",
    detail: "Bot messages",
    status: discordStored?.webhook || discordStored?.bot_token || process.env.DISCORD_BOT_TOKEN ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: discordStored?.lastUsedAt || null,
    connectedAt: discordStored?.connectedAt || null,
    configured: Boolean(process.env.DISCORD_BOT_TOKEN || (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET)),
    method: "oauth",
    connectUrl: "/api/integrations/discord/connect",
    connectLabel: "Connect Discord",
    setupHint: "Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET (or DISCORD_BOT_TOKEN)"
  });

  const coinbaseStored = getProvider("coinbase", userId);
  connections.push({
    id: "coinbase",
    label: "Coinbase",
    detail: "OAuth access for trading data",
    status: coinbaseStored?.access_token || process.env.COINBASE_ACCESS_TOKEN ? "connected" : "disconnected",
    scopes: coinbaseStored?.scope ? String(coinbaseStored.scope).split(/\\s|,/).filter(Boolean) : [],
    lastUsedAt: coinbaseStored?.lastUsedAt || null,
    connectedAt: coinbaseStored?.connectedAt || null,
    configured: Boolean(process.env.COINBASE_CLIENT_ID && process.env.COINBASE_CLIENT_SECRET),
    method: "oauth",
    connectUrl: "/api/integrations/coinbase/connect",
    connectLabel: "Connect Coinbase",
    setupHint: "Set COINBASE_CLIENT_ID and COINBASE_CLIENT_SECRET in apps/server/.env"
  });

  const robinhoodStored = getProvider("robinhood", userId);
  connections.push({
    id: "robinhood",
    label: "Robinhood (experimental)",
    detail: "Manual token (read-only stub)",
    status: robinhoodStored?.access_token || process.env.ROBINHOOD_ACCESS_TOKEN ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: robinhoodStored?.lastUsedAt || null,
    connectedAt: robinhoodStored?.connectedAt || null,
    configured: true,
    method: "token",
    connectUrl: "/api/integrations/robinhood/connect",
    connectLabel: "Connect Robinhood",
    setupHint: "Paste a session token (experimental, read-only)."
  });

  const telegramStored = getProvider("telegram", userId);
  connections.push({
    id: "telegram",
    label: "Telegram",
    detail: "Bot messages",
    status: telegramStored?.token || process.env.TELEGRAM_BOT_TOKEN ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: telegramStored?.lastUsedAt || null,
    connectedAt: telegramStored?.connectedAt || null,
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    method: "token",
    connectLabel: "Set Bot Token",
    setupHint: "Set TELEGRAM_BOT_TOKEN in apps/server/.env"
  });

  const whatsappConfigured = Boolean(
    (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TO) ||
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_TO)
  );
  connections.push({
    id: "whatsapp",
    label: "WhatsApp",
    detail: "Outbound notifications",
    status: whatsappConfigured ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: null,
    connectedAt: null,
    configured: whatsappConfigured,
    method: "api_key",
    connectLabel: "Set WhatsApp Keys",
    setupHint: "Set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (Cloud API) or TWILIO_WHATSAPP_*"
  });

  const smsConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_SMS_FROM &&
    process.env.TWILIO_SMS_TO
  );
  connections.push({
    id: "messages",
    label: "Messages (SMS)",
    detail: "Outbound text notifications",
    status: smsConfigured ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: null,
    connectedAt: null,
    configured: smsConfigured,
    method: "api_key",
    connectLabel: "Set Twilio Keys",
    setupHint: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TWILIO_SMS_TO"
  });

  const metaStored = getProvider("meta", userId) || {};
  const metaConfigured = Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  connections.push({
    id: "facebook",
    label: "Facebook Pages",
    detail: "Posts, insights, sentiment",
    status: metaStored?.facebook?.access_token ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: metaStored?.lastUsedAt || null,
    connectedAt: metaStored?.connectedAt || null,
    configured: metaConfigured,
    method: "oauth",
    connectUrl: "/api/integrations/meta/connect?product=facebook",
    connectLabel: "Connect Meta",
    setupHint: "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET"
  });

  connections.push({
    id: "instagram",
    label: "Instagram",
    detail: "Posts and metrics",
    status: metaStored?.instagram?.access_token ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: metaStored?.lastUsedAt || null,
    connectedAt: metaStored?.connectedAt || null,
    configured: metaConfigured,
    method: "oauth",
    connectUrl: "/api/integrations/meta/connect?product=instagram",
    connectLabel: "Connect Meta",
    setupHint: "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET"
  });

  connections.push({
    id: "fireflies",
    label: "Fireflies.ai",
    detail: "Meeting transcription and summaries",
    status: process.env.FIREFLIES_API_KEY ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: null,
    connectedAt: null,
    configured: Boolean(process.env.FIREFLIES_API_KEY),
    method: "api_key",
    connectLabel: "Set API Key",
    setupHint: "Set FIREFLIES_API_KEY in apps/server/.env"
  });

  connections.push({
    id: "plex",
    label: "Plex",
    detail: "Server status and library health",
    status: process.env.PLEX_URL && process.env.PLEX_TOKEN ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: null,
    connectedAt: null,
    configured: Boolean(process.env.PLEX_URL && process.env.PLEX_TOKEN),
    method: "api_key",
    connectLabel: "Set Plex Keys",
    setupHint: "Set PLEX_URL and PLEX_TOKEN"
  });

  connections.push({
    id: "amazon",
    label: "Amazon",
    detail: "Product Advertising API",
    status: process.env.AMAZON_ACCESS_KEY && process.env.AMAZON_SECRET_KEY && process.env.AMAZON_PARTNER_TAG ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: null,
    connectedAt: null,
    configured: Boolean(process.env.AMAZON_ACCESS_KEY && process.env.AMAZON_SECRET_KEY && process.env.AMAZON_PARTNER_TAG),
    method: "api_key",
    connectLabel: "Set API Keys",
    setupHint: "Set AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG"
  });

  connections.push({
    id: "walmart",
    label: "Walmart",
    detail: "Shopping list sync",
    status: process.env.WALMART_CLIENT_ID && process.env.WALMART_CLIENT_SECRET ? "connected" : "disconnected",
    scopes: [],
    lastUsedAt: null,
    connectedAt: null,
    configured: Boolean(process.env.WALMART_CLIENT_ID && process.env.WALMART_CLIENT_SECRET),
    method: "api_key",
    connectLabel: "Set API Keys",
    setupHint: "Set WALMART_CLIENT_ID and WALMART_CLIENT_SECRET"
  });

  return connections;
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

function extractJsonArray(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, "").trim();
  const first = cleaned.indexOf("[");
  const last = cleaned.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

function buildTradingPreferenceBlock(training) {
  const lines = [];
  const notes = String(training?.notes || "").trim();
  if (notes) lines.push(`Directives: ${notes}`);
  const questions = Array.isArray(training?.questions) ? training.questions : [];
  const answered = questions
    .map(q => ({
      question: String(q?.question || "").trim(),
      answer: String(q?.answer || "").trim()
    }))
    .filter(q => q.question && q.answer);
  if (answered.length) {
    lines.push("Guiding Questions:");
    answered.forEach(item => {
      lines.push(`- ${item.question} ${item.answer}`);
    });
  }
  return lines.join("\n");
}

function withTimeout(promise, timeoutMs, label = "timeout") {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function computeTradingRecommendations({
  assetClass = "all",
  topN = 12,
  symbols,
  horizonDays,
  includeSignals = true,
  userId = "local"
} = {}) {
  const resolvedHorizon = horizonDays || Number(process.env.TRADING_RECOMMENDATION_WINDOW_DAYS || 180);
  const emailSettings = getTradingEmailSettings(userId);
  const training = getTradingTrainingSettings(userId);

  const stockList = Array.isArray(symbols) && symbols.length
    ? symbols
    : Array.isArray(emailSettings?.stocks) ? emailSettings.stocks : [];
  const cryptoList = Array.isArray(emailSettings?.cryptos) ? emailSettings.cryptos : [];
  let watchlist = [];
  if (assetClass === "stock") watchlist = stockList;
  else if (assetClass === "crypto") watchlist = cryptoList;
  else watchlist = [...stockList, ...cryptoList];

  let warnings = [];
  const knowledgeTimeoutMs = Number(process.env.TRADING_RECOMMENDATIONS_KNOWLEDGE_TIMEOUT_MS || 8000);
  const llmTimeoutMs = Number(process.env.TRADING_RECOMMENDATIONS_LLM_TIMEOUT_MS || 20000);
  const signalTimeoutMs = Number(process.env.TRADING_RECOMMENDATIONS_SIGNAL_TIMEOUT_MS || 20000);
  if (!watchlist.length) {
    const fallbackUniverse = getDefaultTradingUniverse();
    const fallbackStocks = Array.isArray(fallbackUniverse?.stocks) ? fallbackUniverse.stocks : [];
    const fallbackCryptos = Array.isArray(fallbackUniverse?.cryptos) ? fallbackUniverse.cryptos : [];
    if (assetClass === "stock") watchlist = fallbackStocks;
    else if (assetClass === "crypto") watchlist = fallbackCryptos;
    else watchlist = [...fallbackStocks, ...fallbackCryptos];
    if (watchlist.length) {
      warnings.push("Watchlist was empty; using default universe. Add tickers to personalize.");
    }
  }
  if (!watchlist.length) throw new Error("watchlist_empty");

  let picks = [];
  let source = "daily_picks";
  if (process.env.OPENAI_API_KEY) {
    const preferenceBlock = buildTradingPreferenceBlock(training);
    let knowledgeContext = "";
    try {
      const knowledgeQuery = `Trading knowledge, risk considerations, and recent trade lessons for: ${watchlist.join(", ")}`;
      const knowledge = await withTimeout(
        queryTradingKnowledge(knowledgeQuery, { topK: 6 }),
        knowledgeTimeoutMs,
        "knowledge_timeout"
      );
      knowledgeContext = knowledge?.context || "";
    } catch (err) {
      if (err?.message === "knowledge_timeout") {
        warnings.push("Trading knowledge lookup timed out; proceeding without context.");
      }
      knowledgeContext = "";
    }
    const systemPrompt = `
You are Aika's trading analyst. Return ranked trade recommendations using ONLY the provided watchlist.
Do not invent news. Use general market reasoning (trend, momentum, volatility, macro risk).
If uncertain, set bias to WATCH. Keep rationale concise (1-3 sentences).
Return ONLY a JSON array like:
[
  {"symbol":"BTC-USD","assetClass":"crypto","bias":"BUY","confidence":0.72,"rationale":"..."}
]
Valid bias values: BUY, SELL, WATCH. Confidence is 0-1.
`.trim();

    const userPrompt = `
Asset focus: ${assetClass}
Requested picks: ${topN}
Watchlist: ${watchlist.join(", ")}
${knowledgeContext ? `Trading knowledge context:\n${knowledgeContext}` : "Trading knowledge context: (none)"}
${preferenceBlock ? `Trader preferences:\n${preferenceBlock}` : "Trader preferences: (none)"}
`.trim();

    try {
      const response = await withTimeout(
        client.responses.create({
          model: OPENAI_MODEL,
          max_output_tokens: 700,
          input: [
            { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
            { role: "user", content: [{ type: "input_text", text: userPrompt }] }
          ]
        }),
        llmTimeoutMs,
        "llm_timeout"
      );
      let rawText = extractResponseText(response);
      if (!rawText.trim()) {
        rawText = await withTimeout(
          fallbackChatCompletion({ systemPrompt, userText: userPrompt, maxOutputTokens: 700 }),
          llmTimeoutMs,
          "llm_timeout"
        );
      }
      if (rawText.trim()) {
        const parsedJson = extractJsonArray(rawText);
        const rawList = Array.isArray(parsedJson) ? parsedJson : Array.isArray(parsedJson?.picks) ? parsedJson.picks : null;
        if (rawList) {
          picks = rawList
            .map(item => ({
              symbol: String(item?.symbol || "").trim(),
              assetClass: String(item?.assetClass || item?.asset_class || "").trim()
                || (stockList.includes(item?.symbol) ? "stock" : "crypto"),
              bias: String(item?.bias || "WATCH").toUpperCase(),
              confidence: Number(item?.confidence || 0),
              rationale: String(item?.rationale || item?.abstract || "").trim()
            }))
            .filter(item => item.symbol)
            .slice(0, topN);
          source = knowledgeContext ? "llm+rag" : "llm";
        }
      }
    } catch (err) {
      if (err?.message === "llm_timeout") {
        warnings.push("LLM request timed out; using daily picks.");
      }
      // fall back to daily picks
    }
  }

  if (!picks.length) {
    const daily = await generateDailyPicks({
      emailSettings: {
        ...emailSettings,
        stocks: stockList,
        cryptos: cryptoList
      }
    });
    picks = (daily || []).slice(0, topN).map(item => ({
      symbol: item.symbol,
      assetClass: item.assetClass || item.asset_class || "stock",
      bias: item.bias || "WATCH",
      confidence: item.score != null ? Math.min(0.9, Math.max(0.1, Math.abs(item.score) * 10)) : 0,
      rationale: item.abstract || item.reason || ""
    }));
    source = "daily_picks";
  }

  if (includeSignals && picks.length) {
    let signalTimeouts = 0;
    const signalResults = await Promise.all(picks.map(async pick => {
      try {
        const detail = await withTimeout(
          getScenarioDetail({
            symbol: pick.symbol,
            assetClass: pick.assetClass,
            windowDays: resolvedHorizon
          }),
          signalTimeoutMs,
          "signal_timeout"
        );
        if (!detail || detail.error) return null;
        return buildLongTermSignal(detail, { horizonDays: resolvedHorizon });
      } catch (err) {
        if (err?.message === "signal_timeout") signalTimeouts += 1;
        return null;
      }
    }));
    if (signalTimeouts) {
      warnings.push(`Signal data timed out for ${signalTimeouts} pick${signalTimeouts === 1 ? "" : "s"}.`);
    }
    picks = picks.map((pick, idx) => ({
      ...pick,
      signal: signalResults[idx] || null
    }));
  }

  const historyEnabled = String(process.env.TRADING_RECOMMENDATIONS_STORE_HISTORY || "1") !== "0";
  if (historyEnabled && picks.length) {
    const header = [
      `Recommendation run (${new Date().toISOString()})`,
      `Asset focus: ${assetClass}`,
      `Horizon days: ${resolvedHorizon}`,
      `Source: ${source}`
    ];
    const lines = picks.map((pick, idx) => {
      const signal = pick.signal?.action ? `Signal: ${pick.signal.action} (${pick.signal.score})` : "";
      return `${idx + 1}. ${pick.symbol} ${pick.bias} ${signal} ${pick.rationale || ""}`.trim();
    });
    const text = [...header, "", ...lines].join("\n");
    ingestTradingDocument({
      kind: "recommendations",
      title: `Recommendation Run - ${new Date().toLocaleDateString()}`,
      text,
      tags: ["recommendations", "signals", "weekly"],
      sourceGroup: "recommendations"
    }).catch(() => {});
  }

  return { picks, source, horizonDays: resolvedHorizon, warnings };
}

function getMonitorState() {
  const flags = getRuntimeFlags();
  return flags[MONITOR_FLAG_KEY] || { lastRunAt: null, alerts: {} };
}

function setMonitorState(state) {
  return setRuntimeFlag(MONITOR_FLAG_KEY, state);
}

function shouldSendMonitorAlert(alerts, symbol, action, cooldownHours) {
  const entry = alerts?.[symbol];
  if (!entry || !entry.lastSentAt) return true;
  if (entry.action !== action) return true;
  const last = Date.parse(entry.lastSentAt);
  if (!Number.isFinite(last)) return true;
  const cooldownMs = (cooldownHours || 12) * 60 * 60 * 1000;
  return Date.now() - last > cooldownMs;
}

async function runTradingRecommendationMonitor({ force = false } = {}) {
  if (monitorRunning) return { ok: false, skipped: true, reason: "already_running" };
  const enabled = String(process.env.TRADING_MONITOR_ENABLED || "1") === "1";
  if (!enabled && !force) return { ok: false, skipped: true, reason: "disabled" };
  monitorRunning = true;
  try {
    const topN = Number(process.env.TRADING_MONITOR_TOP_N || 8);
    const minScore = Number(process.env.TRADING_MONITOR_MIN_SIGNAL_SCORE || 1.2);
    const cooldownHours = Number(process.env.TRADING_MONITOR_ALERT_COOLDOWN_HOURS || 12);
    const horizonDays = Number(process.env.TRADING_RECOMMENDATION_WINDOW_DAYS || 180);

    const result = await computeTradingRecommendations({
      assetClass: "all",
      topN,
      horizonDays,
      includeSignals: true,
      userId: "local"
    });

    const alerts = [];
    const state = getMonitorState();
    const alertState = state.alerts || {};
    const chatId = process.env.TELEGRAM_CHAT_ID || "";

    for (const pick of result.picks || []) {
      const signal = pick.signal;
      if (!signal || typeof signal.score !== "number") continue;
      if (Math.abs(signal.score) < minScore) continue;
      const action = signal.action || "";
      const isBuy = action.includes("ACCUMULATE") || action.includes("BUY");
      const isSell = action.includes("REDUCE") || action.includes("AVOID");
      if (!isBuy && !isSell) continue;

      const alertAction = isBuy ? "BUY" : "SELL";
      if (!shouldSendMonitorAlert(alertState, pick.symbol, alertAction, cooldownHours)) continue;

      const reasons = Array.isArray(signal.reasons) ? signal.reasons.slice(0, 4) : [];
      const message = [
        "Aika Market Monitor",
        `${alertAction} signal for ${pick.symbol}`,
        `Signal: ${signal.action} (score ${signal.score})`,
        pick.rationale ? `Rationale: ${pick.rationale}` : "",
        reasons.length ? `Why: ${reasons.join(" ")}` : "",
        "Review in Trading > Recommendations."
      ].filter(Boolean).join("\n");

      if (chatId) {
        try {
          await sendTelegramMessage(chatId, message);
          alertState[pick.symbol] = { action: alertAction, lastSentAt: new Date().toISOString() };
          alerts.push({ symbol: pick.symbol, action: alertAction, score: signal.score });
        } catch (err) {
          console.warn("monitor telegram failed", err?.message || err);
        }
      }
    }

    setMonitorState({
      lastRunAt: new Date().toISOString(),
      alerts: alertState,
      lastAlerts: alerts
    });
    return { ok: true, alerts, total: alerts.length };
  } catch (err) {
    console.warn("monitor failed", err?.message || err);
    return { ok: false, error: err?.message || "monitor_failed" };
  } finally {
    monitorRunning = false;
  }
}

function startTradingRecommendationMonitor() {
  if (monitorInterval) return;
  const intervalMin = Number(process.env.TRADING_MONITOR_INTERVAL_MINUTES || 360);
  if (!intervalMin || intervalMin <= 0) return;
  runTradingRecommendationMonitor().catch(() => {});
  monitorInterval = setInterval(() => {
    runTradingRecommendationMonitor().catch(() => {});
  }, intervalMin * 60_000);
}

async function analyzeTradeOutcome(outcome = {}) {
  const pnl = Number(outcome.pnl);
  const pnlPct = Number(outcome.pnl_pct);
  const fallback = () => {
    if (Number.isFinite(pnl) && pnl < 0) {
      return "Loss outcome. Review entry timing, risk sizing, and confirm the thesis still held. Consider tighter stop-loss or smaller position sizing.";
    }
    if (Number.isFinite(pnl) && pnl > 0) {
      return "Positive outcome. Review what worked (trend confirmation, risk sizing, catalyst) and document the pattern to repeat.";
    }
    return "Outcome recorded. Add more detail to improve future trade reviews.";
  };

  if (!process.env.OPENAI_API_KEY) return fallback();
  try {
    const system = "You are a trading review assistant. Provide a concise analysis (2-4 sentences) and one improvement suggestion.";
    const user = [
      `Symbol: ${outcome.symbol || "unknown"}`,
      `Side: ${outcome.side || "unknown"}`,
      `Quantity: ${outcome.quantity || "unknown"}`,
      `PnL: ${Number.isFinite(pnl) ? pnl : outcome.pnl || "unknown"}`,
      `PnL%: ${Number.isFinite(pnlPct) ? pnlPct : outcome.pnl_pct || "unknown"}`,
      outcome.notes ? `Notes: ${outcome.notes}` : ""
    ].filter(Boolean).join("\n");
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] }
      ],
      max_output_tokens: 220
    });
    const text = response?.output_text || "";
    return text.trim() || fallback();
  } catch {
    return fallback();
  }
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

function verifySlackSignature(req) {
  const secret = process.env.SLACK_SIGNING_SECRET || "";
  if (!secret) return true;
  const timestamp = req.headers["x-slack-request-timestamp"];
  const signature = req.headers["x-slack-signature"];
  if (!timestamp || !signature) return false;
  const rawBody = req.rawBody || "";
  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", secret).update(base).digest("hex");
  const expected = `v0=${hmac}`;
  if (expected.length !== String(signature).length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function getWorkspaceId(req) {
  return (
    req.aikaUser?.workspaceId
    || req.headers["x-workspace-id"]
    || req.aikaUser?.id
    || "default"
  );
}

function getUserId(req) {
  return (
    req.aikaUser?.id
    || req.headers["x-user-id"]
    || "local"
  );
}

function getBaseUrl() {
  return process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8790}`;
}

function getUiBaseUrl() {
  return process.env.WEB_UI_URL || "http://localhost:3000";
}

function getRequestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (!host) return "";
  return `${proto}://${host}`;
}

function normalizeLocation(value) {
  return String(value || "")
    .trim()
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .replace(/\s+/g, " ");
}

function extractLocationFromText(text) {
  const input = String(text || "").trim();
  if (!input) return null;
  const patterns = [
    /\b(?:i live in|my city is|my location is|i'm based in|i am based in|home base is)\s+([a-z0-9 ,.'-]{2,})$/i,
    /\b(?:location|city|home)\s*[:=-]\s*([a-z0-9 ,.'-]{2,})$/i
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m?.[1]) return normalizeLocation(m[1]);
  }
  return null;
}

function getStoredHomeLocation(db) {
  try {
    const rows = db
      .prepare(
        `SELECT content, tags
         FROM memories
         WHERE lower(tags) LIKE '%location%'
            OR lower(content) LIKE '%live in%'
            OR lower(content) LIKE '%city is%'
            OR lower(content) LIKE 'home location:%'
         ORDER BY id DESC
         LIMIT 30`
      )
      .all();
    for (const row of rows) {
      const fromMemory = extractLocationFromText(row?.content || "");
      if (fromMemory) return fromMemory;
      const labeled = String(row?.content || "").match(/^home location:\s*(.+)$/i);
      if (labeled?.[1]) return normalizeLocation(labeled[1]);
    }
  } catch {
    // ignore lookup errors and fall back
  }
  return null;
}

function parseWeatherLocation(userText, fallbackLocation = null) {
  const text = String(userText || "")
    .replace(/[?!]+$/g, "")
    .trim();
  if (!/\b(weather|forecast|temperature)\b/i.test(text)) return null;
  const m1 = text.match(/\b(?:in|at|for)\s+([a-z0-9 ,.'-]{2,})$/i);
  if (m1?.[1]) {
    const explicit = normalizeLocation(
      m1[1].replace(/\b(?:right now|today|now|please)\b/gi, " ")
    );
    if (explicit) return explicit;
  }
  const m2 = text.match(/\bweather\s+([a-z0-9 ,.'-]{2,})$/i);
  if (m2?.[1]) {
    const explicit = normalizeLocation(
      m2[1].replace(/\b(?:right now|today|now|please)\b/gi, " ")
    );
    if (explicit) return explicit;
  }
  return normalizeLocation(fallbackLocation || process.env.DEFAULT_WEATHER_LOCATION || "");
}

function parseWebQuery(userText) {
  const text = String(userText || "").trim();
  let m = text.match(/^(?:search(?: the)? web for|look up|find online)\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  m = text.match(/^google\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function parseProductResearchQuery(userText) {
  const text = String(userText || "").trim();
  const hasCommerceCue = /\b(price|deal|product|amazon|buy|purchase|shopping|cart|compare)\b/i.test(text);
  if (!hasCommerceCue && !/\bbest\b/i.test(text)) return null;
  const direct = text.match(
    /^(?:find|research|compare|analyze)(?:\s+me)?\s+(?:the\s+)?(?:best\s+price\s+for\s+|best\s+|price\s+for\s+|shopping\s+for\s+)?(.+)$/i
  );
  if (direct?.[1]) return normalizeLocation(direct[1]);
  const priceIntent = /\b(best price|cheapest|lowest price|price compare|compare prices|deal on)\b/i.test(text);
  const amazonIntent = /\bamazon|product\b/i.test(text);
  if (priceIntent || amazonIntent) {
    const cleaned = text
      .replace(/\b(can you|please|aika|hey aika|find|research|compare|analyze|for me|on amazon|at amazon|best price|cheapest|lowest price|price compare|compare prices|deal on)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const normalized = normalizeLocation(cleaned.replace(/^(?:me|the)\s+/i, ""));
    if (normalized.length >= 3) return normalized;
  }
  return null;
}

function formatWeatherText(weather) {
  const place = [weather.location?.name, weather.location?.admin1, weather.location?.country]
    .filter(Boolean)
    .join(", ");
  const c = weather.current || {};
  return [
    `Current weather for ${place || "requested location"}:`,
    `${c.weatherText || "Unknown conditions"}, ${c.temperatureC ?? "?"}°C (feels like ${c.apparentTemperatureC ?? "?"}°C).`,
    `Humidity ${c.humidityPct ?? "?"}% · Wind ${c.windSpeedKmh ?? "?"} km/h · Precipitation ${c.precipitationMm ?? "?"} mm.`,
    c.observedAt ? `Observed at ${c.observedAt}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function formatSearchResults(searchResult) {
  const items = Array.isArray(searchResult?.results) ? searchResult.results : [];
  if (!items.length) return `I couldn't find strong results for "${searchResult?.query || "that query"}".`;
  const lines = items.slice(0, 5).map((item, idx) => {
    const title = item.title || `Result ${idx + 1}`;
    const snippet = item.snippet || "";
    const url = item.url || "";
    return `${idx + 1}. ${title}${snippet ? ` - ${snippet}` : ""}${url ? `\n   ${url}` : ""}`;
  });
  return `Top web results for "${searchResult.query}":\n${lines.join("\n")}`;
}

function formatProductResearchText(report) {
  const best = report?.recommendationItem;
  const fallback = `I finished the product research for "${report?.query || "your request"}".`;
  if (!best) {
    return `${fallback} I need more pricing data before recommending a top pick.`;
  }
  const lines = [
    `I ran a product analysis for "${report.query}".`,
    `Recommendation: ${best.title}${best.priceDisplay ? ` at ${best.priceDisplay}` : ""}.`,
    report?.analysis?.reasoning ? `Why: ${report.analysis.reasoning}` : "",
    "I opened the detailed comparison panel so you can review options and add one to Amazon cart."
  ].filter(Boolean);
  return lines.join(" ");
}

function parseMemoryWrite(userText) {
  const text = String(userText || "").trim();
  const m = text.match(/^(?:remember|save this|store this)\s*(?:that)?\s*[:,-]?\s*(.+)$/i);
  if (!m?.[1]) return null;
  const fact = normalizeLocation(m[1]);
  return fact.length ? fact : null;
}

function parseMemoryRecall(userText) {
  const text = String(userText || "").trim();
  if (!/\b(remember|recall|memory|what do you know about|what do you remember)\b/i.test(text)) return null;
  const m = text.match(/\b(?:about|regarding|on)\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  return text;
}

const PICK_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

function parsePickCount(text, fallback = 3) {
  const lower = String(text || "").toLowerCase();
  const match = lower.match(/\btop\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (match?.[1]) {
    const raw = match[1];
    const parsed = Number.isFinite(Number(raw)) ? Number(raw) : PICK_WORDS[raw];
    if (Number.isFinite(parsed)) return parsed;
  }
  const match2 = lower.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:picks?|stocks?|cryptos?)\b/);
  if (match2?.[1]) {
    const raw = match2[1];
    const parsed = Number.isFinite(Number(raw)) ? Number(raw) : PICK_WORDS[raw];
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampInt(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function isTradingPickRequest(text) {
  const lower = String(text || "").toLowerCase();
  if (!/(pick|picks|top|best|recommend|recommendation)/.test(lower)) return false;
  return /(stock|stocks|crypto|cryptos|cryptocurrency|coin|coins|ticker|trading)/.test(lower);
}

function parseTradingPickRequest(text) {
  if (!isTradingPickRequest(text)) return null;
  const lower = String(text || "").toLowerCase();
  const count = clampInt(parsePickCount(lower, 3), 1, 6);
  const wantsStocks = /(stock|stocks|equity|equities)/.test(lower);
  const wantsCrypto = /(crypto|cryptos|cryptocurrency|coin|coins)/.test(lower);
  if (wantsStocks || wantsCrypto) {
    return {
      stockCount: wantsStocks ? count : 0,
      cryptoCount: wantsCrypto ? count : 0
    };
  }
  return { stockCount: count, cryptoCount: count };
}

function formatNumber(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "n/a";
  return num.toFixed(digits);
}

function formatPercent(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "n/a";
  return `${num.toFixed(digits)}%`;
}

function buildAsciiSparkline(values, width = 24) {
  const list = Array.isArray(values) ? values.filter(v => Number.isFinite(v)) : [];
  if (!list.length) return "";
  const slice = list.length > width ? list.slice(-width) : list;
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const levels = " .:-=+*#%@";
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  if (max === min) return levels[levels.length - 1].repeat(slice.length);
  return slice
    .map(v => {
      const ratio = (v - min) / (max - min);
      const idx = Math.max(0, Math.min(levels.length - 1, Math.round(ratio * (levels.length - 1))));
      return levels[idx];
    })
    .join("");
}

function shortenSnippet(text, max = 160) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 3)}...`;
}

function cleanSignalText(text, symbol) {
  let cleaned = String(text || "").trim();
  if (!cleaned) return "";
  if (symbol) {
    const symbolPattern = new RegExp(`^${symbol}\\s*\\([^)]*\\)\\s*\\|\\s*`, "i");
    cleaned = cleaned.replace(symbolPattern, "");
  }
  cleaned = cleaned.replace(/Bias:\s*[^|]+\|\s*/i, "");
  cleaned = cleaned.replace(/Confidence:\s*[^|]+\|\s*/i, "");
  return cleaned.trim();
}

async function buildPickInsight(pick, { windowDays = 120 } = {}) {
  const insight = {
    symbol: pick.symbol,
    assetClass: pick.assetClass || "stock",
    bias: pick.bias || pick.label || "WATCH",
    rationale: pick.abstract || pick.reason || "",
    scenario: null,
    ragSnippet: ""
  };
  try {
    insight.scenario = await getScenarioDetail({
      symbol: insight.symbol,
      assetClass: insight.assetClass,
      windowDays,
      includeCandles: true
    });
  } catch (err) {
    insight.scenario = { error: err?.message || "scenario_failed" };
  }
  try {
    const knowledge = await queryTradingKnowledge(
      `Key risks, catalysts, and setups for ${insight.symbol}`,
      { topK: 3 }
    );
    insight.ragSnippet = knowledge?.citations?.[0]?.snippet || "";
  } catch {
    insight.ragSnippet = "";
  }
  return insight;
}

async function handleTradingPickRequest({ userText, userId } = {}) {
  const request = parseTradingPickRequest(userText);
  if (!request) return null;
  const stockCount = request.stockCount || 0;
  const cryptoCount = request.cryptoCount || 0;
  if (stockCount + cryptoCount === 0) return null;

  const settings = getTradingEmailSettings(userId || "local");
  const emailSettings = {
    ...settings,
    stockCount,
    cryptoCount,
    minPicks: 0,
    maxPicks: stockCount + cryptoCount
  };

  let picks = [];
  try {
    picks = await generateDailyPicks({ emailSettings });
  } catch {
    picks = [];
  }

  const stockPicks = picks.filter(p => p.assetClass === "stock").slice(0, stockCount);
  const cryptoPicks = picks.filter(p => p.assetClass === "crypto").slice(0, cryptoCount);
  const combined = [...stockPicks, ...cryptoPicks];

  if (!combined.length) {
    return {
      text: "I couldn't generate picks right now. Check your trading watchlist and data sources, then try again."
    };
  }

  const insights = [];
  for (const pick of combined) {
    // Sequential to avoid hammering data providers.
    insights.push(await buildPickInsight(pick, { windowDays: 120 }));
  }

  const formatSection = (title, items) => {
    if (!items.length) return [];
    const lines = [title];
    items.forEach((item, idx) => {
      const scenario = item.scenario || {};
      const closeSeries = (scenario.candles || []).map(c => c.c).filter(v => Number.isFinite(v));
      const chart = buildAsciiSparkline(closeSeries.slice(-30), 24);
      const trend = scenario.trendLabel || "n/a";
      const rsi = formatNumber(scenario.rsi14, 2);
      const windowReturn = formatPercent(scenario.returnPct, 2);
      const vol = formatPercent(scenario.annualVol, 2);
      const momentum20 = formatPercent(scenario.momentum20, 2);
      const support = formatNumber(scenario.support, 2);
      const resistance = formatNumber(scenario.resistance, 2);
      const rationale = shortenSnippet(cleanSignalText(item.rationale, item.symbol), 160);
      if (scenario?.error) {
        lines.push(`${idx + 1}) ${item.symbol} (${item.assetClass}) | Bias ${item.bias}`);
        if (rationale) lines.push(`Signal: ${rationale}`);
        lines.push(`Data: unavailable (${scenario.error})`);
      } else {
        lines.push(
          `${idx + 1}) ${item.symbol} (${item.assetClass}) | Bias ${item.bias} | Trend ${trend} | RSI ${rsi} | ${scenario.windowDays || 120}d ${windowReturn}`
        );
        if (rationale) lines.push(`Signal: ${rationale}`);
        if (chart) lines.push(`Chart(30d): ${chart}`);
        lines.push(`Momentum20 ${momentum20} | Vol ${vol} | Support ${support} | Resistance ${resistance}`);
      }
      const ragSnippet = shortenSnippet(item.ragSnippet, 180);
      lines.push(`RAG: ${ragSnippet || "No relevant knowledge snippet found."}`);
    });
    return lines;
  };

  const stockInsights = insights.filter(item => item.assetClass === "stock");
  const cryptoInsights = insights.filter(item => item.assetClass === "crypto");
  const outputLines = [
    "Here are signal-based picks from your configured watchlist (educational, not financial advice):",
    "",
    ...formatSection("Stocks:", stockInsights),
    "",
    ...formatSection("Crypto:", cryptoInsights),
    "",
    "Data: daily candles via Stooq/Coinbase/Alpaca. RAG snippets come from your trading knowledge store."
  ].filter(Boolean);

  return {
    text: outputLines.join("\n"),
    picks: combined
  };
}

function shouldUseRag(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  if (t.startsWith("rag:") || t.startsWith("meeting:")) return true;
  return /\b(fireflies|meeting|meetings|transcript|minutes|action items|decisions|recap|summary|summarize|what did we decide|last week|this week|trading|stock|stocks|crypto|options|portfolio)\b/i.test(t);
}

function parseRagModelCommand(text) {
  const match = String(text || "").match(/\b(?:create|build|make)\s+(?:a\s+)?rag\s+(?:model|collection)\s+(?:on|for)\s+(.+)$/i);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function resolveRagSelection(text, requested) {
  const cleaned = String(requested || "").trim().toLowerCase();
  const rawText = String(text || "");
  const lower = rawText.toLowerCase();
  const prefixMatch = lower.match(/^rag:\s*([a-z0-9_-]+)/);
  const hinted = prefixMatch?.[1] || "";
  const selected = cleaned && cleaned !== "auto" ? cleaned : hinted;
  if (selected) {
    if (selected === "trading") return { id: "trading", forced: true, filters: { meetingIdPrefix: "trading:" } };
    if (selected === "fireflies") return { id: "fireflies", forced: true, filters: { meetingType: "fireflies" } };
    if (selected === "all") return { id: "all", forced: true, filters: {} };
    return { id: selected, forced: true, filters: { meetingIdPrefix: `rag:${selected}:` } };
  }
  if (/\b(fireflies|meeting|transcript|minutes|action items|decisions|recap)\b/i.test(lower)) {
    return { id: "fireflies", forced: false, filters: { meetingType: "fireflies" } };
  }
  if (/\b(stock|stocks|crypto|trading|options|portfolio|ticker)\b/i.test(lower)) {
    return { id: "trading", forced: false, filters: { meetingIdPrefix: "trading:" } };
  }
  return { id: "all", forced: false, filters: {} };
}

function isAdmin(req) {
  return (
    String(req.headers["x-user-role"] || "").toLowerCase() === "admin"
    || String(req.aikaUser?.role || "").toLowerCase() === "admin"
  );
}

function isAdminRequest(req) {
  if (isAdmin(req)) return true;
  const token = process.env.ADMIN_APPROVAL_TOKEN;
  if (!token) return false;
  return req.headers["x-admin-token"] === token;
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

  async function transcribeRecordingWithFallback(recordingId, audioPath) {
    let primaryResult = null;
    if (audioPath) {
      try {
        const stat = fs.statSync(audioPath);
        const maxBytes = Number(process.env.STT_MAX_MB || 20) * 1024 * 1024;
        if (stat.size <= maxBytes) {
          primaryResult = await transcribeAudio(audioPath);
          if (!primaryResult?.error && String(primaryResult?.text || "").trim()) {
            return primaryResult;
          }
        } else {
          const segmentDir = path.join(recordingsDir, recordingId, "segments");
          const segmentSeconds = Number(process.env.STT_SEGMENT_SECONDS || 600);
          const segments = splitAudioForTranscription(audioPath, segmentDir, segmentSeconds);
          if (segments.length) {
            const texts = [];
            const allSegments = [];
            let cursor = 0;
            for (const segmentPath of segments) {
              const part = await transcribeAudio(segmentPath);
              if (part?.error || !String(part?.text || "").trim()) {
                cursor += segmentSeconds;
                continue;
              }
              texts.push(String(part.text).trim());
              const segs = Array.isArray(part.segments) && part.segments.length
                ? part.segments
                : [{ speaker: "Speaker 1", start: 0, end: Math.max(1, String(part.text).trim().split(/\s+/).length / 2.5), text: part.text }];
              for (const seg of segs) {
                const start = Number(seg.start || 0) + cursor;
                const endBase = Number(seg.end || start + 1);
                const end = Math.max(start + 0.2, endBase + cursor);
                allSegments.push({
                  speaker: seg.speaker || "Speaker",
                  start,
                  end,
                  text: String(seg.text || "").trim()
                });
              }
              const last = allSegments[allSegments.length - 1];
              cursor = last ? last.end + 0.25 : cursor + segmentSeconds;
            }
            if (texts.length) {
              return {
                text: texts.join(" ").replace(/\s+/g, " ").trim(),
                language: "en",
                provider: "openai_segmented",
                segments: allSegments
              };
            }
          }
        }
      } catch (err) {
        primaryResult = await transcribeAudio(audioPath);
        if (!primaryResult?.error && String(primaryResult?.text || "").trim()) {
          return primaryResult;
        }
      }
    }

  const chunks = listRecordingChunks(recordingId);
  if (!chunks.length) {
    return primaryResult || {
      text: "",
      language: "en",
      provider: "error",
      error: "audio_missing",
      segments: []
    };
  }

  let cursor = 0;
  const allSegments = [];
  const texts = [];
  for (const chunk of chunks) {
    const part = await transcribeAudio(chunk.storagePath);
    if (part?.error || !String(part?.text || "").trim()) continue;
    texts.push(String(part.text).trim());
    const segs = Array.isArray(part.segments) && part.segments.length
      ? part.segments
      : [{ speaker: "Speaker 1", start: 0, end: Math.max(1, String(part.text).trim().split(/\s+/).length / 2.5), text: part.text }];
    for (const seg of segs) {
      const start = Number(seg.start || 0) + cursor;
      const endBase = Number(seg.end || start + 1);
      const end = Math.max(start + 0.2, endBase + cursor);
      allSegments.push({
        speaker: seg.speaker || "Speaker",
        start,
        end,
        text: String(seg.text || "").trim()
      });
    }
    const last = allSegments[allSegments.length - 1];
    cursor = last ? last.end + 0.25 : cursor + 2;
  }

  if (!texts.length) {
    return primaryResult || {
      text: "",
      language: "en",
      provider: "error",
      error: "transcription_failed",
      segments: []
    };
  }

  return {
    text: texts.join(" ").replace(/\s+/g, " ").trim(),
    language: "en",
    provider: "openai_chunk_fallback",
    segments: allSegments
  };
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
  const transcriptResult = await transcribeRecordingWithFallback(recordingId, audioPath);
  if (transcriptResult?.error) {
    updateRecording(recordingId, {
      status: "failed",
      transcript_text: "",
      transcript_json: JSON.stringify({
        provider: transcriptResult.provider || "unknown",
        error: transcriptResult.error,
        segments: []
      }),
      diarization_json: JSON.stringify([])
    });
    updateProcessingState(recordingId, {
      stage: "failed",
      error: transcriptResult.error,
      doneAt: new Date().toISOString()
    });
    return;
  }
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
  const summary = await summarizeAndPersistRecording({
    recordingId,
    transcriptText: transcriptResult.text || "",
    title: recording.title,
    redactionEnabled: recording.redaction_enabled
  });

  try {
    await indexRecordingToRag({
      recording: {
        ...recording,
        storage_url: recording.storage_url || (audioPath ? `/api/recordings/${recordingId}/audio` : "")
      },
      transcriptText: transcriptResult.text || "",
      segments: transcriptResult.segments || [],
      summary
    });
  } catch (err) {
    console.warn("Recording RAG ingest failed:", err?.message || err);
  }

  try {
    const notifyChannels = parseNotifyChannels(process.env.RECORDING_NOTIFY_CHANNELS || "");
    if (notifyChannels.length) {
      await sendMeetingNotifications({
        meetingId: `recording:${recordingId}`,
        title: recording.title || "Aika Recording",
        occurredAt: recording.started_at || recording.created_at || new Date().toISOString(),
        summary,
        sourceUrl: recording.storage_url || (audioPath ? `/api/recordings/${recordingId}/audio` : ""),
        channels: notifyChannels
      });
    }
  } catch (err) {
    console.warn("Recording notification failed:", err?.message || err);
  }

  const artifacts = [];
  if (opts.createArtifacts) {
    const content = summary.summaryMarkdown || "";
    const filePath = writeArtifact(recordingId, "summary.md", content);
    artifacts.push({ type: "local", name: "summary.md", path: filePath });
      try {
        const doc = await createGoogleDoc(`${recording.title} Summary`, content, recording.created_by || "local");
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

async function summarizeAndPersistRecording({ recordingId, transcriptText, title, redactionEnabled }) {
  const summary = await summarizeTranscript(transcriptText || "", title);
  let summaryPayload = {
    tldr: summary.tldr,
    attendees: summary.attendees,
    overview: summary.overview,
    decisions: summary.decisions,
    actionItems: summary.actionItems,
    risks: summary.risks,
    nextSteps: summary.nextSteps,
    discussionPoints: summary.discussionPoints,
    nextMeeting: summary.nextMeeting,
    summaryMarkdown: summary.summaryMarkdown,
    recommendations: summary.recommendations || []
  };
  if (redactionEnabled) {
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
  return summary;
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.aikaUser) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    user: {
      id: req.aikaUser.id,
      email: req.aikaUser.email || null,
      name: req.aikaUser.name || null,
      picture: req.aikaUser.picture || null
    }
  });
});

app.post("/api/auth/logout", (req, res) => {
  if (req.aikaSessionId) {
    destroySession(req.aikaSessionId);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { userText, maxOutputTokens, ragModel, threadId, channel, senderId, senderName } = req.body;
    if (!userText || typeof userText !== "string") {
      return res.status(400).json({ error: "userText required" });
    }
    const lowerText = userText.toLowerCase();
    const requestedRagModel = typeof ragModel === "string" ? ragModel.trim() : "";
    const threadHistoryLimit = Math.max(1, Number(process.env.THREAD_HISTORY_MAX_MESSAGES || 14) || 14);
    const thread = threadId ? getThread(threadId) : null;
    const threadActive = Boolean(thread && thread.status === "active");
    const threadHistory = threadActive ? listThreadMessages(threadId, threadHistoryLimit) : [];
    const threadContextText = threadHistory.length
      ? threadHistory
          .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
          .join("\n")
      : "";
    const effectiveRagModel = requestedRagModel || (threadActive ? thread.rag_model : "");
    const threadMessageMeta = threadActive ? { channel, senderId, senderName } : null;
    const recordThreadMessage = (role, content) => {
      if (!threadActive || !content) return;
      try {
        appendThreadMessage({ threadId: thread.id, role, content, metadata: threadMessageMeta });
      } catch {
        // ignore thread logging failures
      }
    };
    const sendAssistantReply = (text, behavior = makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 }), extra = {}) => {
      addMemoryIndexed({
        role: "assistant",
        content: text,
        tags: "reply"
      });
      recordThreadMessage("assistant", text);
      return res.json({ text, behavior, ...extra });
    };

    if (isStopPhrase(userText)) {
      setKillSwitch({ enabled: true, reason: "stop_phrase", activatedBy: getUserId(req) });
      return sendAssistantReply(
        "Standing down. Safety lock is active. Use the Safety tab to resume.",
        makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 })
      );
    }

    const killState = getKillSwitchState();
    if (killState.enabled) {
      return sendAssistantReply(
        "Aika is in stand-down mode. You can view status/logs or disable the kill switch from the Safety tab.",
        makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 }),
        { killSwitch: true }
      );
    }

    recordThreadMessage("user", userText);

    addMemoryIndexed({
      role: "user",
      content: userText,
      tags: "message"
    });

    const statedLocation = extractLocationFromText(userText);
    if (statedLocation) {
      addMemoryIndexed({
        role: "system",
        content: `Home location: ${statedLocation}`,
        tags: "fact,location,profile"
      });
      return sendAssistantReply(
        `Got it. I will remember your location as ${statedLocation}, and use it when you ask for weather.`,
        makeBehavior({ emotion: Emotion.HAPPY, intensity: 0.45 }),
        { memoryAdded: true }
      );
    }

    const explicitMemory = parseMemoryWrite(userText);
    if (explicitMemory) {
      const locationInMemory = extractLocationFromText(explicitMemory);
      addMemoryIndexed({
        role: "system",
        content: explicitMemory,
        tags: locationInMemory ? "fact,explicit,location" : "fact,explicit"
      });
      if (locationInMemory) {
        addMemoryIndexed({
          role: "system",
          content: `Home location: ${locationInMemory}`,
          tags: "fact,location,profile"
        });
      }
      return sendAssistantReply(
        locationInMemory
          ? `Got it. I will remember your location as ${locationInMemory}, and use it for weather.`
          : `Got it. I'll remember this: "${explicitMemory}"`,
        makeBehavior({ emotion: Emotion.HAPPY, intensity: 0.45 }),
        { memoryAdded: true }
      );
    }

    if (/\b(what do you remember|what do you know about|do you remember|recall)\b/i.test(userText)) {
      const recallQuery = parseMemoryRecall(userText) || userText;
      const matches = searchMemories(db, recallQuery, 12);
      const explicitFacts = matches.filter(m => String(m.tags || "").toLowerCase().includes("fact"));
      const filtered = matches.filter(
        m => !/^(remember|save this|store this|what do you remember|what do you know about|do you remember|recall)\b/i.test(String(m.content || "").toLowerCase())
      );
      const displayMatches = (explicitFacts.length ? explicitFacts : filtered.length ? filtered : matches).slice(0, 8);
      if (!displayMatches.length) {
        return sendAssistantReply(
          "I don't have a stored memory for that yet. You can say: Remember that ...",
          makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 })
        );
      }
      const memoryText = displayMatches
        .map(m => `- [${new Date(m.created_at).toLocaleString()}] (${m.role}) ${m.content}`)
        .join("\n");
      return sendAssistantReply(
        `Here's what I remember:\n${memoryText}`,
        makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.45 }),
        { memories: displayMatches, memoryRecall: true }
      );
    }

    const tradingPickResult = await handleTradingPickRequest({
      userText,
      userId: getUserId(req)
    });
    if (tradingPickResult) {
      return sendAssistantReply(
        tradingPickResult.text,
        makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.45 }),
        { tradingPicks: tradingPickResult.picks || [] }
      );
    }

    const ragTopic = parseRagModelCommand(userText);
    if (ragTopic) {
      try {
        const model = await createRagModel({ topic: ragTopic, autoDiscover: true });
        return sendAssistantReply(
          `Created RAG model "${model.title}" with ${model.sources?.length || 0} seed source(s). You can select it from the Knowledge Map dropdown.`,
          makeBehavior({ emotion: Emotion.HAPPY, intensity: 0.45 }),
          { ragModel: model.id }
        );
      } catch (err) {
        return sendAssistantReply(
          `I couldn't create that RAG model. ${err?.message || "Please try a different topic."}`,
          makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 })
        );
      }
    }

    const ragSelection = resolveRagSelection(userText, effectiveRagModel);
    const shouldRag = ragSelection?.forced || shouldUseRag(userText);
    if (shouldRag && ragSelection) {
      try {
        const ragCounts = getRagCounts();
        if (ragCounts.totalChunks > 0) {
          const queryText = userText
            .replace(/^rag:\s*[a-z0-9_-]+/i, "")
            .replace(/^meeting:\s*/i, "")
            .trim() || userText;
          const ragResult = await answerRagQuestionRouted(queryText, {
            topK: Number(process.env.RAG_TOP_K || 8),
            filters: ragSelection.filters || {},
            ragModel: ragSelection.id || "auto",
            conversationContext: threadContextText
          });
          if (ragResult?.answer) {
            const ragAnswer = String(ragResult.answer || "").trim();
            const ragCitations = ragResult.citations || [];
            const ragUnknown = /i don't know based on the provided context/i.test(ragAnswer);
            if (ragCitations.length && !ragUnknown) {
              const memoryRecall = ragCitations.some(cite => {
                const chunkId = String(cite?.chunk_id || "");
                return chunkId.startsWith("memory:") || chunkId.startsWith("feedback:");
              });
              return sendAssistantReply(
                ragAnswer,
                makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 }),
                { citations: ragCitations, source: "rag", memoryRecall, ragModel: ragSelection.id }
              );
            }
            if (ragResult?.gap && ragUnknown) {
              return sendAssistantReply(
                `I don't have enough knowledge to answer that. I can build a new RAG model on \"${ragResult.gap.topic}\" if you want me to.`,
                makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 }),
                { ragGap: ragResult.gap, source: "rag", ragModel: ragSelection.id }
              );
            }
          }
        }
      } catch {
        // ignore RAG failures and continue with other handlers
      }
    }

    const productQuery = parseProductResearchQuery(userText);
    if (productQuery) {
      try {
        const report = await runProductResearch({
          query: productQuery,
          limit: 8,
          openaiClient: process.env.OPENAI_API_KEY ? client : null,
          model: OPENAI_MODEL
        });
        return sendAssistantReply(
          formatProductResearchText(report),
          makeBehavior({ emotion: Emotion.HAPPY, intensity: 0.5 }),
          { productResearch: report, tool: "shopping.productResearch" }
        );
      } catch (err) {
        return sendAssistantReply(
          `I could not complete product research right now (${err?.message || "product_research_failed"}).`,
          makeBehavior({ emotion: Emotion.SAD, intensity: 0.45 })
        );
      }
    }

    const weatherRequested = /\b(weather|forecast|temperature)\b/i.test(userText);
    const weatherLocation = parseWeatherLocation(userText, getStoredHomeLocation(db));
    if (weatherRequested && !weatherLocation) {
      return sendAssistantReply(
        "I can do that. Tell me your location once (for example: \"my city is Seattle, WA\"), and after that just ask \"what is the weather\".",
        makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
      );
    }
    if (weatherLocation) {
      try {
        const weather = await fetchCurrentWeather(weatherLocation);
        return sendAssistantReply(
          formatWeatherText(weather),
          makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 }),
          { tool: "weather.current", data: weather }
        );
      } catch (err) {
        return sendAssistantReply(
          `I couldn't fetch weather for "${weatherLocation}" right now (${err?.message || "request_failed"}).`,
          makeBehavior({ emotion: Emotion.SAD, intensity: 0.45 })
        );
      }
    }

    const webQuery = parseWebQuery(userText);
    if (webQuery) {
      try {
        const searchResult = await searchWeb(webQuery, 5);
        return sendAssistantReply(
          formatSearchResults(searchResult),
          makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.45 }),
          { tool: "web.search", data: searchResult }
        );
      } catch (err) {
        return sendAssistantReply(
          `I couldn't complete that web search right now (${err?.message || "request_failed"}).`,
          makeBehavior({ emotion: Emotion.SAD, intensity: 0.45 })
        );
      }
    }

    if (lowerText.includes("fireflies")) {
      if (!process.env.FIREFLIES_API_KEY) {
        return sendAssistantReply(
          "Fireflies is not configured yet. Please set FIREFLIES_API_KEY in apps/server/.env and restart the server.",
          makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
        );
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
          return sendAssistantReply(
            "I couldn't find a Fireflies transcript yet. Share a Fireflies view link or make sure Fireflies has transcripts in your account.",
            makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
          );
        }

        const detail = await fetchFirefliesTranscript(transcriptId);
        transcript = detail?.data?.transcript;
        if (!transcript) {
          return sendAssistantReply(
            "I couldn't access that transcript. Please confirm the link is valid and your API key has access.",
            makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
          );
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
            ].join("\n"), getUserId(req));
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

        return sendAssistantReply(responseText, makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.45 }));
      } catch (err) {
        return sendAssistantReply(
          "Fireflies request failed. Please check your FIREFLIES_API_KEY and ensure the transcript is accessible.",
          makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.4 })
        );
      }
    }

    const skillResult = await handleSkillMessage(userText);
    if (skillResult) {
      return sendAssistantReply(
        skillResult.text,
        makeBehavior({ emotion: Emotion.NEUTRAL, intensity: 0.35 }),
        { skill: skillResult.skill }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "missing_openai_api_key" });
    }

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

    const threadInput = threadHistory
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [{ type: "input_text", text: m.content }]
      }));

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
- Reply in English unless the user explicitly asks for another language
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
        ...threadInput,
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
      const fallbackUserText = threadContextText
        ? `Conversation context:
${threadContextText}

User: ${userText}`
        : userText;
      rawText = await fallbackChatCompletion({ systemPrompt, userText: fallbackUserText, maxOutputTokens });
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
    return sendAssistantReply(replyText, behavior);
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
  const meetingDate = recording?.started_at ? new Date(recording.started_at).toLocaleDateString() : "Unknown";
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
    `# Meeting Notes - ${title}`,
    "",
    `Meeting Title & Date: ${title} - ${meetingDate}`,
    `Attendees: ${attendees.length ? attendees.join(", ") : "Not captured"}`,
    "TL;DR / Executive Summary:",
    tldr || (overview.length ? overview.slice(0, 2).join(" ") : "Summary pending."),
    "",
    "Key Decisions Made:",
    decisions.length ? decisions.map(item => `- ${item}`).join("\n") : "- None captured.",
    "",
    "Action Items:",
    tasks.length
      ? tasks.map(item => {
          const task = item.task || item.title || item.text || "";
          const owner = item.owner || "Unassigned";
          const due = item.due || "Unspecified";
          return `- ${owner}: ${task} (Due: ${due})`;
        }).join("\n")
      : "- None captured.",
    "",
    "Key Discussion Points/Insights:",
    discussionPoints.length
      ? discussionPoints.map(p => `- ${p.topic || "Discussion"}: ${p.summary || ""}`).join("\n")
      : "- Not captured.",
    risks.length ? `\nRisks/Issues:\n${risks.map(item => `- ${item}`).join("\n")}` : "",
    "",
    "Next Steps/Follow-up:",
    nextMeeting?.date || nextMeeting?.goal
      ? `- ${nextMeeting.date || "TBD"}: ${nextMeeting.goal || "Follow-up meeting"}`
      : (nextSteps.length ? nextSteps.map(item => `- ${item}`).join("\n") : "- Follow up to confirm next steps."),
    "",
    `Meeting metadata: started ${started}, created by ${recording?.created_by || "local"}, workspace ${recording?.workspace_id || "default"}.`,
    "",
    "Transcript (Timestamped):",
    transcriptText || "Transcript not available yet."
  ].join("\n");
}

function buildAbsoluteUrl(req, maybeUrl) {
  if (!maybeUrl) return "";
  const url = String(maybeUrl);
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env.PUBLIC_SERVER_URL || process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function buildMeetingEmailText({ recording, notesUrl, transcriptUrl, audioUrl, googleDocUrl }) {
  const summary = recording?.summary_json || {};
  const tasks = recording?.tasks_json || summary.actionItems || [];
  const decisions = recording?.decisions_json || summary.decisions || [];
  const nextSteps = recording?.next_steps_json || summary.nextSteps || [];
  const lines = [
    `Meeting: ${recording?.title || "Meeting"}`,
    `Date: ${recording?.started_at ? new Date(recording.started_at).toLocaleString() : "Unknown"}`,
    "",
    "Executive Summary:",
    String(summary.tldr || (summary.overview || []).slice(0, 2).join(" ") || "Summary pending."),
    "",
    "Key Decisions:"
  ];
  if (decisions.length) decisions.forEach(d => lines.push(`- ${d}`));
  else lines.push("- None captured.");
  lines.push("", "Action Items:");
  if (tasks.length) {
    tasks.forEach(task => {
      const owner = task.owner || "Unassigned";
      const text = task.task || task.title || task.text || "Task";
      const due = task.due || "Unspecified";
      lines.push(`- ${owner}: ${text} (Due: ${due})`);
    });
  } else {
    lines.push("- None captured.");
  }
  lines.push("", "Next Steps:");
  if (nextSteps.length) nextSteps.forEach(s => lines.push(`- ${s}`));
  else lines.push("- Follow up and confirm owners.");
  lines.push("", "Links:");
  if (googleDocUrl) lines.push(`- Google Doc: ${googleDocUrl}`);
  if (notesUrl) lines.push(`- Meeting Notes (markdown): ${notesUrl}`);
  if (transcriptUrl) lines.push(`- Transcript (txt): ${transcriptUrl}`);
  if (audioUrl) lines.push(`- Recording Audio: ${audioUrl}`);
  return lines.join("\n");
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

app.post("/api/recordings/:id/final", recordingFinalUpload.single("audio"), (req, res) => {
  try {
    const recording = getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: "recording_not_found" });
    if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
    if (!req.file?.path) return res.status(400).json({ error: "audio_missing" });
    updateRecording(recording.id, {
      storage_path: req.file.path,
      storage_url: `/api/recordings/${recording.id}/audio`
    });
    res.json({ ok: true, path: req.file.path });
  } catch (err) {
    res.status(500).json({ error: err?.message || "recording_final_failed" });
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
    const updates = {
      ended_at: endedAt,
      duration: durationSec ? Math.round(Number(durationSec)) : null,
      status: "processing"
    };
    if (recording.storage_path) {
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

app.post("/api/recordings/:id/resummarize", async (req, res) => {
  try {
    const recording = getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: "recording_not_found" });
    if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
    if (!String(recording.transcript_text || "").trim()) {
      return res.status(400).json({ error: "transcript_required" });
    }

    updateRecording(recording.id, { status: "processing" });
    updateProcessingState(recording.id, { stage: "summarizing" });
    const summary = await summarizeAndPersistRecording({
      recordingId: recording.id,
      transcriptText: recording.transcript_text,
      title: recording.title,
      redactionEnabled: recording.redaction_enabled
    });

    try {
      await indexRecordingToRag({
        recording: {
          ...recording,
          storage_url: recording.storage_url || (recording.storage_path ? `/api/recordings/${recording.id}/audio` : "")
        },
        transcriptText: recording.transcript_text || "",
        segments: recording.diarization_json || [],
        summary,
        force: true
      });
    } catch (err) {
      console.warn("Recording RAG reindex failed:", err?.message || err);
    }

    try {
      const notifyChannels = parseNotifyChannels(process.env.RECORDING_NOTIFY_CHANNELS || "");
      if (notifyChannels.length) {
        await sendMeetingNotifications({
          meetingId: `recording:${recording.id}`,
          title: recording.title || "Aika Recording",
          occurredAt: recording.started_at || recording.created_at || new Date().toISOString(),
          summary,
          sourceUrl: recording.storage_url || (recording.storage_path ? `/api/recordings/${recording.id}/audio` : ""),
          channels: notifyChannels,
          force: true
        });
      }
    } catch (err) {
      console.warn("Recording notification failed:", err?.message || err);
    }

    if (summary?.summaryMarkdown) {
      const filePath = writeArtifact(recording.id, "summary.md", summary.summaryMarkdown);
      const prev = Array.isArray(recording.artifacts_json) ? recording.artifacts_json : [];
      const kept = prev.filter(a => !(a?.type === "local" && a?.name === "summary.md"));
      kept.push({ type: "local", name: "summary.md", path: filePath });
      updateRecording(recording.id, { artifacts_json: JSON.stringify(kept) });
    }

    updateRecording(recording.id, { status: "ready" });
    updateProcessingState(recording.id, { stage: "ready", doneAt: new Date().toISOString() });
    res.json({ ok: true, recording: getRecording(recording.id) });
  } catch (err) {
    console.error("Recording resummarize failed:", err);
    updateRecording(req.params.id, { status: "failed" });
    updateProcessingState(req.params.id, { stage: "failed", error: "resummarize_failed", doneAt: new Date().toISOString() });
    res.status(500).json({ error: err?.message || "resummarize_failed" });
  }
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
  const ext = path.extname(recording.storage_path || "").toLowerCase();
  if (ext === ".ogg" || ext === ".oga") res.type("audio/ogg");
  else if (ext === ".wav") res.type("audio/wav");
  else res.type("audio/webm");
  res.sendFile(recording.storage_path);
});

app.post("/api/stt/transcribe", sttUpload.single("audio"), async (req, res) => {
  let sttPath = req.file?.path;
  try {
    if (!sttPath) return res.status(400).json({ error: "audio_required" });
    const originalExt = path.extname(req.file.originalname || "").replace(".", "").toLowerCase();
    const mime = String(req.file.mimetype || "").toLowerCase();
    const inferredExt =
      originalExt ||
      (mime.includes("webm")
        ? "webm"
        : mime.includes("ogg")
          ? "ogg"
          : mime.includes("wav")
            ? "wav"
            : mime.includes("mp3") || mime.includes("mpeg")
              ? "mp3"
              : mime.includes("mp4")
                ? "mp4"
                : mime.includes("m4a")
                  ? "m4a"
                  : "");
    if (inferredExt && !sttPath.toLowerCase().endsWith(`.${inferredExt}`)) {
      const withExt = `${sttPath}.${inferredExt}`;
      fs.renameSync(sttPath, withExt);
      sttPath = withExt;
    }
    const result = await transcribeAudio(sttPath);
    if (result?.error) {
      return res.status(400).json({ error: result.error, provider: result.provider || "unknown" });
    }
    res.json({ text: result.text || "", provider: result.provider || "unknown" });
  } catch (err) {
    res.status(500).json({ error: err?.message || "stt_failed" });
  } finally {
    try {
      if (sttPath && fs.existsSync(sttPath)) fs.unlinkSync(sttPath);
      if (req.file?.path && sttPath !== req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
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

app.post("/api/recordings/:id/email", async (req, res) => {
  try {
    const recording = getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: "recording_not_found" });
    if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
    const toRaw = String(req.body?.to || "").trim();
    if (!toRaw) return res.status(400).json({ error: "email_to_required" });
    const recipients = toRaw.split(/[;,]/).map(v => v.trim()).filter(Boolean);
    if (!recipients.length) return res.status(400).json({ error: "email_to_required" });
    const bad = recipients.find(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    if (bad) return res.status(400).json({ error: "email_to_invalid", detail: bad });

    const notes = buildMeetingNotesMarkdown(recording);
    const notesUrl = buildAbsoluteUrl(req, `/api/recordings/${recording.id}/notes`);
    const transcriptUrl = buildAbsoluteUrl(req, `/api/recordings/${recording.id}/transcript`);
    const audioUrl = recording.storage_path ? buildAbsoluteUrl(req, getRecordingAudioUrl(recording.id, recording)) : "";
    let googleDocUrl = "";
    const artifacts = Array.isArray(recording.artifacts_json) ? recording.artifacts_json : [];
    const docArtifact = artifacts.find(a => a?.type === "google_doc" && a?.url);
    if (docArtifact?.url) googleDocUrl = String(docArtifact.url);
      if (!googleDocUrl) {
        try {
          const doc = await createGoogleDoc(`${recording.title || "Meeting"} Notes`, notes, recording.created_by || "local");
          if (doc?.documentId) googleDocUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;
        } catch {
          // ignore; email can still include local links
        }
      }

    const subject = String(req.body?.subject || `Meeting Notes: ${recording.title || "Meeting"}`);
    const text = buildMeetingEmailText({ recording, notesUrl, transcriptUrl, audioUrl, googleDocUrl });
    const fromName = String(process.env.EMAIL_FROM_NAME || "Aika Meeting Copilot");
    const allowOutboxFallback = String(process.env.EMAIL_OUTBOX_FALLBACK || "0").toLowerCase() === "1";
    const googleStatus = getGoogleStatus(recording.created_by || getUserId(req));
    const scopes = new Set(Array.isArray(googleStatus.scopes) ? googleStatus.scopes : []);
    const hasGmailSendScope = scopes.has("https://www.googleapis.com/auth/gmail.send");
    if (!googleStatus.connected || !hasGmailSendScope) {
      return res.status(409).json({
        error: "gmail_send_scope_missing",
        detail: "Google needs reconnect with gmail.send scope to send email.",
        reconnectUrl: "/api/integrations/google/connect?preset=core"
      });
    }
    const result = await executeAction({
      actionType: "email.send",
      params: { to: recipients, subject },
      context: { userId: getUserId(req), sessionId: req.aikaSessionId },
      summary: `Send meeting notes email for ${recording.id}`,
      handler: async () => {
        try {
          const sent = await sendGmailMessage({
            to: recipients,
            subject,
            text,
            fromName,
            userId: recording.created_by || getUserId(req)
          });
          return {
            ok: true,
            transport: "gmail",
            to: recipients,
            messageId: sent?.id || null,
            links: { notesUrl, transcriptUrl, audioUrl, googleDocUrl }
          };
        } catch (err) {
          if (!allowOutboxFallback) {
            throw err;
          }
          const outbox = writeOutbox({
            type: "meeting_email",
            to: recipients,
            subject,
            text,
            recordingId: recording.id,
            reason: String(err?.message || "gmail_not_configured")
          });
          return {
            ok: true,
            transport: "stub",
            to: recipients,
            outboxId: outbox.id,
            warning: "gmail_send_unavailable_saved_to_outbox",
            links: { notesUrl, transcriptUrl, audioUrl, googleDocUrl }
          };
        }
      }
    });
    if (result.status === "approval_required") {
      return res.status(403).json(result);
    }
    return res.json(result.data);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err?.message || "recording_email_failed", reason: err.reason });
  }
});

app.delete("/api/recordings/:id", (req, res) => {
  const recording = getRecording(req.params.id);
  if (!recording) return res.status(404).json({ error: "recording_not_found" });
  if (!canAccessRecording(req, recording)) return res.status(403).json({ error: "forbidden" });
  executeAction({
    actionType: "file.delete",
    params: { recordingId: recording.id, path: recording.storage_path || "" },
    context: { userId: getUserId(req), sessionId: req.aikaSessionId },
    resourceRefs: [recording.storage_path || ""],
    summary: `Delete recording ${recording.id}`,
    handler: async () => {
      deleteAgentActionsForRecording(recording.id);
      deleteMemoryEntitiesForRecording(recording.id);
      deleteRecording(recording.id);
      return { ok: true, id: recording.id };
    }
  })
    .then(result => {
      if (result.status === "approval_required") {
        return res.status(403).json(result);
      }
      return res.json(result.data);
    })
    .catch(err => {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || "recording_delete_failed", reason: err.reason });
    });
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
          const event = await createCalendarEvent(fallback, recording.created_by || getUserId(req));
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
          const doc = await createGoogleDoc(`${recording.title} Recap`, markdown, recording.created_by || "local");
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

app.get("/api/integrations", (req, res) => {
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
  const whatsappConfigured = Boolean(
    (process.env.WHATSAPP_APP_ID && process.env.WHATSAPP_APP_SECRET) ||
    (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TO) ||
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_TO)
  );
  const messagesConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_SMS_FROM &&
    process.env.TWILIO_SMS_TO
  );
  const integrationsState = buildIntegrationsState(getUserId(req));
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
      whatsapp: { ...integrationsState.whatsapp, configured: whatsappConfigured },
      messages: { ...integrationsState.messages, configured: messagesConfigured }
    }
  });
});

const firefliesSyncSchema = z.object({
  limit: z.number().int().min(0).optional(),
  force: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  async: z.boolean().optional()
});

const ragAskSchema = z.object({
  question: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional(),
  filters: z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    titleContains: z.string().optional(),
    meetingId: z.string().optional(),
    meetingIdPrefix: z.string().optional(),
    meetingType: z.string().optional()
  }).optional()
});

const ragModelCreateSchema = z.object({
  topic: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  sources: z.array(z.string()).optional(),
  autoDiscover: z.boolean().optional()
}).refine(data => data.topic || data.name, { message: "topic_required" });

const feedbackSchema = z.object({
  source: z.string().optional(),
  rating: z.enum(["up", "down"]),
  question: z.string().optional(),
  answer: z.string().optional(),
  messageId: z.string().optional(),
  citations: z.array(z.object({
    meeting_title: z.string().optional(),
    occurred_at: z.string().optional(),
    chunk_id: z.string().optional(),
    snippet: z.string().optional()
  })).optional()
});

const tradingSettingsSchema = z.object({
  email: z.object({
    enabled: z.boolean().optional(),
    time: z.string().optional(),
    recipients: z.array(z.string()).optional(),
    subjectPrefix: z.string().optional(),
    minPicks: z.number().int().min(1).max(50).optional(),
    maxPicks: z.number().int().min(1).max(50).optional(),
    stockCount: z.number().int().min(0).max(50).optional(),
    cryptoCount: z.number().int().min(0).max(50).optional(),
    stocks: z.array(z.string()).optional(),
    cryptos: z.array(z.string()).optional()
  }).optional(),
  training: z.object({
    notes: z.string().optional(),
    questions: z.array(z.object({
      id: z.string().optional(),
      question: z.string().min(1),
      answer: z.string().optional()
    })).optional()
  }).optional()
});

const tradingRecommendationsSchema = z.object({
  assetClass: z.enum(["crypto", "stock", "all"]).optional(),
  topN: z.number().int().min(1).max(20).optional(),
  symbols: z.array(z.string()).optional(),
  horizonDays: z.number().int().min(30).max(365).optional(),
  includeSignals: z.boolean().optional()
});

const tradingKnowledgeIngestSchema = z.object({
  title: z.string().min(3),
  text: z.string().min(20),
  tags: z.array(z.string()).optional()
});

const tradingKnowledgeUrlSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  useOcr: z.boolean().optional(),
  ocrMaxPages: z.number().int().min(0).max(50).optional(),
  ocrScale: z.number().min(1).max(6).optional(),
  force: z.boolean().optional()
});

const tradingKnowledgeUploadSchema = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  useOcr: z.boolean().optional(),
  ocrMaxPages: z.number().int().min(0).max(50).optional(),
  ocrScale: z.number().min(1).max(6).optional(),
  force: z.boolean().optional()
});

const tradingKnowledgeAskSchema = z.object({
  question: z.string().min(3),
  topK: z.number().int().min(1).max(12).optional()
});

const tradingKnowledgeDeepSchema = z.object({
  question: z.string().min(3),
  topK: z.number().int().min(1).max(12).optional(),
  allowFallback: z.boolean().optional()
});

const tradingSourceSchema = z.object({
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional()
});

const tradingSourceUpdateSchema = z.object({
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional()
});

const tradingKnowledgeCrawlSchema = z.object({
  maxDepth: z.number().int().min(0).max(5).optional(),
  maxPages: z.number().int().min(1).max(2000).optional(),
  maxPagesPerDomain: z.number().int().min(1).max(500).optional(),
  delayMs: z.number().int().min(0).max(5000).optional(),
  force: z.boolean().optional()
});

const tradingRssSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  includeForeign: z.boolean().optional()
});

const tradingRssSourceUpdateSchema = z.object({
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  includeForeign: z.boolean().optional()
});

const tradingRssCrawlSchema = z.object({
  force: z.boolean().optional(),
  maxItemsPerFeed: z.number().int().min(1).max(200).optional()
});

const tradingRssSeedSchema = z.object({
  url: z.string().url().optional()
});

const tradingYoutubeSourceSchema = z.object({
  channel: z.string().min(2),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  maxVideos: z.number().int().min(0).max(10000).optional()
});

const tradingYoutubeSourceUpdateSchema = z.object({
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  maxVideos: z.number().int().min(0).max(10000).optional()
});

const signalsRunSchema = z.object({
  force: z.boolean().optional(),
  sourceIds: z.array(z.string()).optional()
});

const tradingYoutubeCrawlSchema = z.object({
  force: z.boolean().optional(),
  maxVideos: z.number().int().min(0).max(10000).optional(),
  maxNewVideos: z.number().int().min(0).max(1000).optional()
});

const tradingYoutubeSearchSchema = z.object({
  queries: z.array(z.string()).optional(),
  maxChannels: z.number().int().min(1).max(200).optional(),
  minSubscribers: z.number().int().min(0).max(100000000).optional(),
  minScore: z.number().min(0).max(25).optional(),
  autoAdd: z.boolean().optional()
});

const tradingScenarioSchema = z.object({
  assetClass: z.enum(["crypto", "stock", "all"]).optional(),
  windowDays: z.number().int().min(3).max(365).optional(),
  picks: z.array(z.string()).optional(),
  useDailyPicks: z.boolean().optional()
});

const tradingOutcomeSchema = z.object({
  symbol: z.string().optional(),
  side: z.string().optional(),
  quantity: z.string().optional(),
  pnl: z.union([z.number(), z.string()]).optional(),
  pnl_pct: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional()
});

const actionPlanSchema = z.object({
  instruction: z.string().min(3),
  startUrl: z.string().optional()
});

const actionRunSchema = z.object({
  taskName: z.string().optional(),
  startUrl: z.string().optional(),
  actions: z.array(z.object({ type: z.string() }).passthrough()).min(1),
  safety: z.object({
    requireApprovalFor: z.array(z.string()).optional(),
    maxActions: z.number().int().optional()
  }).optional(),
  async: z.boolean().optional()
});

const macroSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  startUrl: z.string().optional(),
  actions: z.array(z.object({ type: z.string() }).passthrough()).min(1)
});

const macroRunSchema = z.object({
  params: z.record(z.any()).optional(),
  async: z.boolean().optional()
});

app.post("/api/fireflies/sync", async (req, res) => {
  try {
    const parsed = firefliesSyncSchema.parse(req.body || {});
    if (parsed.async) {
      const queued = queueFirefliesSync({
        limit: parsed.limit ?? 0,
        force: Boolean(parsed.force),
        sendEmail: parsed.sendEmail
      });
      if (queued?.ok === false) {
        const status =
          queued.error === "fireflies_rate_limited"
            ? 429
            : queued.error === "sync_in_progress"
              ? 409
              : 400;
        return res.status(status).json(queued);
      }
      return res.json(queued);
    }
    const result = await executeAction({
      actionType: "integrations.fireflies.sync",
      params: parsed,
      context: { userId: getUserId(req), sessionId: req.aikaSessionId },
      summary: "Sync Fireflies transcripts",
      handler: async () => {
        return await syncFireflies({
          limit: parsed.limit ?? 0,
          force: Boolean(parsed.force),
          sendEmail: parsed.sendEmail
        });
      }
    });
    if (result.status === "approval_required") {
      return res.status(403).json(result);
    }
    const payload = result.data ?? result;
    if (payload?.ok === false) {
      const status =
        payload.error === "fireflies_rate_limited"
          ? 429
          : payload.error === "sync_in_progress"
            ? 409
            : 400;
      return res.status(status).json(payload);
    }
    res.json(payload);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    const status = err.status || 500;
    res.status(status).json({ error: err?.message || "fireflies_sync_failed", reason: err.reason });
  }
});

app.get("/api/fireflies/sync/status", (_req, res) => {
  res.json(getFirefliesSyncStatus());
});

app.post("/api/rag/ask", async (req, res) => {
  try {
    const parsed = ragAskSchema.parse(req.body || {});
    const result = await answerRagQuestionRouted(parsed.question, {
      topK: parsed.topK,
      filters: parsed.filters || {},
      ragModel: "auto"
    });
    res.json(result);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    res.status(500).json({ error: err?.message || "rag_query_failed" });
  }
});

app.get("/api/rag/status", (_req, res) => {
  try {
    res.json({
      ...getRagCounts(),
      vectorStore: getVectorStoreStatus()
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "rag_status_failed" });
  }
});

app.get("/api/rag/models", (_req, res) => {
  try {
    const models = listRagModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err?.message || "rag_models_failed" });
  }
});

app.post("/api/rag/models", rateLimit, async (req, res) => {
  try {
    const parsed = ragModelCreateSchema.parse(req.body || {});
    const model = await createRagModel({
      topic: parsed.topic,
      name: parsed.name,
      description: parsed.description,
      sources: parsed.sources,
      autoDiscover: parsed.autoDiscover !== false
    });
    res.json({ ok: true, model });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    const message = err?.message || "rag_model_create_failed";
    res.status(500).json({ error: message });
  }
});

app.get("/api/trading/settings", (req, res) => {
  try {
    const settings = getTradingSettings(getUserId(req));
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err?.message || "trading_settings_failed" });
  }
});

app.post("/api/trading/settings", (req, res) => {
  try {
    const parsed = tradingSettingsSchema.parse(req.body || {});
    const updated = updateTradingSettings(getUserId(req), parsed);
    rescheduleDailyPicksLoop();
    res.json({ ok: true, settings: updated });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    res.status(500).json({ error: err?.message || "trading_settings_failed" });
  }
});

app.get("/api/trading/symbols/search", rateLimit, async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || "").trim();
    const assetClass = String(req.query.assetClass || req.query.asset || "all").toLowerCase();
    const limit = Number(req.query.limit || 12);
    if (!query) return res.json({ results: [] });
    const result = await searchSymbols({ query, assetClass, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || "symbol_search_failed" });
  }
});

app.post("/api/trading/recommendations", rateLimit, async (req, res) => {
  try {
    const parsed = tradingRecommendationsSchema.parse(req.body || {});
    const result = await computeTradingRecommendations({
      assetClass: parsed.assetClass || "all",
      topN: parsed.topN || 12,
      symbols: parsed.symbols,
      horizonDays: parsed.horizonDays,
      includeSignals: parsed.includeSignals !== false,
      userId: getUserId(req)
    });
    res.json(result);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    res.status(500).json({ error: err?.message || "recommendations_failed" });
  }
});

app.post("/api/trading/recommendations/detail", rateLimit, async (req, res) => {
  try {
    const symbol = String(req.body?.symbol || "").trim();
    const assetClass = String(req.body?.assetClass || "stock").toLowerCase();
    const bias = String(req.body?.bias || "WATCH").toUpperCase();
    const windowDays = Number(req.body?.windowDays || 120);
    const collectionId = String(req.body?.collectionId || "").trim() || undefined;
    if (!symbol) return res.status(400).json({ error: "symbol_required" });
    const detail = await buildRecommendationDetail({
      symbol,
      assetClass,
      bias,
      windowDays,
      collectionId: collectionId === "trading" ? undefined : collectionId
    });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err?.message || "recommendation_detail_failed" });
  }
});

app.get("/api/trading/monitor/status", (_req, res) => {
  try {
    const state = getMonitorState();
    res.json({
      enabled: String(process.env.TRADING_MONITOR_ENABLED || "1") === "1",
      intervalMinutes: Number(process.env.TRADING_MONITOR_INTERVAL_MINUTES || 360),
      lastRunAt: state.lastRunAt || null,
      lastAlerts: state.lastAlerts || []
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "monitor_status_failed" });
  }
});

app.post("/api/trading/monitor/run", rateLimit, async (_req, res) => {
  try {
    const result = await runTradingRecommendationMonitor({ force: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || "monitor_run_failed" });
  }
});

app.post("/api/trading/knowledge/ingest", rateLimit, async (req, res) => {
  try {
    const parsed = tradingKnowledgeIngestSchema.parse(req.body || {});
    const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
    const result = await ingestTradingHowTo({
      title: parsed.title,
      text: parsed.text,
      tags: parsed.tags || [],
      collectionId: collectionId === "trading" ? undefined : collectionId
    });
    res.json(result);
  } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "knowledge_ingest_failed" });
    }
  });

app.post("/api/trading/knowledge/ingest-url", rateLimit, async (req, res) => {
  try {
    const parsed = tradingKnowledgeUrlSchema.parse(req.body || {});
    const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
    const result = await ingestTradingUrl({
      url: parsed.url,
      title: parsed.title,
      tags: parsed.tags || [],
      useOcr: parsed.useOcr,
      ocrMaxPages: parsed.ocrMaxPages,
      ocrScale: parsed.ocrScale,
      force: parsed.force,
      collectionId: collectionId === "trading" ? undefined : collectionId
    });
      if (!result?.ok) {
        return res.status(400).json({ error: result?.error || "knowledge_ingest_failed" });
      }
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "knowledge_ingest_failed" });
    }
  });

  app.post("/api/trading/knowledge/upload", rateLimit, tradingUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "file_required" });
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const payload = {
        title: req.body?.title || "",
        tags: parseTagList(req.body?.tags),
        useOcr: req.body?.useOcr === "true" || req.body?.useOcr === true,
        ocrMaxPages: req.body?.ocrMaxPages ? Number(req.body.ocrMaxPages) : undefined,
        ocrScale: req.body?.ocrScale ? Number(req.body.ocrScale) : undefined,
        force: req.body?.force === "true" || req.body?.force === true
      };
      const parsed = tradingKnowledgeUploadSchema.parse({
        title: payload.title || undefined,
        tags: payload.tags,
        useOcr: payload.useOcr,
        ocrMaxPages: Number.isFinite(payload.ocrMaxPages) ? payload.ocrMaxPages : undefined,
        ocrScale: Number.isFinite(payload.ocrScale) ? payload.ocrScale : undefined,
        force: payload.force
      });
      const result = await ingestTradingFile({
        filePath: file.path,
        originalName: file.originalname,
        title: parsed.title,
        tags: parsed.tags || [],
        useOcr: parsed.useOcr,
        ocrMaxPages: parsed.ocrMaxPages,
        ocrScale: parsed.ocrScale,
        force: parsed.force,
        collectionId: collectionId === "trading" ? undefined : collectionId
      });
      if (!result?.ok) {
        return res.status(400).json({ error: result?.error || "knowledge_ingest_failed" });
      }
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "knowledge_upload_failed" });
    } finally {
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
    }
  });

  app.post("/api/trading/knowledge/sync", rateLimit, async (_req, res) => {
    try {
      const urls = String(process.env.TRADING_RAG_SOURCES || "")
        .split(/[,\n]/)
        .map(u => u.trim())
        .filter(Boolean);
      if (!urls.length) {
        return res.status(400).json({ error: "trading_sources_empty" });
      }
      const result = await syncTradingSources({ urls });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err?.message || "knowledge_sync_failed" });
    }
  });

  app.post("/api/trading/knowledge/crawl", rateLimit, async (req, res) => {
    try {
      const parsed = tradingKnowledgeCrawlSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const envSources = String(process.env.TRADING_RAG_SOURCES || "").trim();
      const storedSources = listTradingSourcesUi({ limit: 500, includeDisabled: false, collectionId });
      if (collectionId === "trading" && !envSources && storedSources.length === 0) {
        return res.status(400).json({ error: "trading_sources_empty" });
      }
      if (collectionId !== "trading" && storedSources.length === 0) {
        return res.status(400).json({ error: "trading_sources_empty" });
      }
      const result = await crawlTradingSources({
        entries: storedSources.length
          ? storedSources.map(item => ({
            id: item.id,
            url: item.url,
            tags: item.tags || [],
            sourceGroup: collectionId && collectionId !== "trading" ? `${collectionId}::${item.url}` : item.url
          }))
          : undefined,
        maxDepth: parsed.maxDepth,
        maxPages: parsed.maxPages,
        maxPagesPerDomain: parsed.maxPagesPerDomain,
        delayMs: parsed.delayMs,
        force: parsed.force,
        collectionId: collectionId === "trading" ? undefined : collectionId
      });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "knowledge_crawl_failed" });
    }
  });

  app.get("/api/trading/knowledge/sources", rateLimit, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 100);
      const search = String(req.query.search || "");
      const includeDisabled = String(req.query.includeDisabled || "1") !== "0";
      const collectionId = String(req.query.collection || req.query.collectionId || "trading").trim();
      if (!collectionId || collectionId === "trading") {
        ensureTradingSourcesSeeded();
      }
      const items = listTradingSourcesUi({ limit, search, includeDisabled, collectionId });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err?.message || "sources_list_failed" });
    }
  });

  app.post("/api/trading/knowledge/sources", rateLimit, async (req, res) => {
    try {
      const parsed = tradingSourceSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const source = addTradingSource({ ...parsed, collectionId });
      res.json({ source, queued: true });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "source_add_failed" });
    }
  });

  app.patch("/api/trading/knowledge/sources/:id", rateLimit, async (req, res) => {
    try {
      const parsed = tradingSourceUpdateSchema.parse(req.body || {});
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const source = updateTradingSourceUi(id, parsed);
      if (!source) return res.status(404).json({ error: "not_found" });
      res.json({ source });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "source_update_failed" });
    }
  });

  app.post("/api/trading/knowledge/sources/:id/crawl", rateLimit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const parsed = tradingKnowledgeCrawlSchema.parse(req.body || {});
      const result = queueTradingSourceCrawl(id, parsed);
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      const status = err?.message === "not_found" ? 404 : 500;
      res.status(status).json({ error: err?.message || "source_crawl_failed" });
    }
  });

  app.delete("/api/trading/knowledge/sources/:id", rateLimit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const deleteKnowledge = String(req.query.deleteKnowledge || "0") === "1";
      const collectionId = String(req.query.collection || req.query.collectionId || "trading").trim();
      const result = removeTradingSource(id, { deleteKnowledge, collectionId });
      if (!result.ok) return res.status(404).json({ error: "not_found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err?.message || "source_delete_failed" });
    }
  });

    app.get("/api/trading/knowledge/list", rateLimit, async (req, res) => {
      try {
        const limit = Number(req.query.limit || 25);
        const search = String(req.query.search || "");
        const tag = String(req.query.tag || "");
        const source = String(req.query.source || "");
        const collectionId = String(req.query.collection || req.query.collectionId || "trading").trim();
        const rows = await listTradingKnowledge({ limit, search, tag, source, collectionId });
        res.json({ items: rows });
      } catch (err) {
        res.status(500).json({ error: err?.message || "knowledge_list_failed" });
      }
    });

  app.get("/api/trading/knowledge/stats", rateLimit, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 500);
      const collectionId = String(req.query.collection || req.query.collectionId || "trading").trim();
      if (!collectionId || collectionId === "trading") {
        await ensureTradingKnowledgeSeeded();
      }
      const stats = getTradingKnowledgeStats({ limit, collectionId });
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err?.message || "knowledge_stats_failed" });
    }
  });

  function buildTradingNodeSummaryFallback(detail) {
    if (!detail) return "";
    const docCount = detail.count || detail.docs?.length || 0;
    const snippet = detail.snippets?.[0]?.text || "";
    const trimmedSnippet = snippet ? snippet.replace(/\s+/g, " ").slice(0, 220) : "";
    const parts = [];
    if (detail.type === "tag") {
      const sourceNames = (detail.sources || []).slice(0, 3).map(s => s.title || s.key).join("; ");
      parts.push(`Tag appears in ${docCount} knowledge item(s).`);
      if (sourceNames) parts.push(`Top sources: ${sourceNames}.`);
    } else if (detail.type === "source") {
      const tagNames = (detail.tags || []).slice(0, 4).map(t => `#${t.tag}`).join(", ");
      parts.push(`Source contributed ${docCount} knowledge item(s).`);
      if (tagNames) parts.push(`Top tags: ${tagNames}.`);
    }
    if (trimmedSnippet) {
      parts.push(`Example snippet: ${trimmedSnippet}${trimmedSnippet.length >= 220 ? "â€¦" : ""}`);
    }
    return parts.join(" ");
  }

  app.get("/api/trading/knowledge/node", rateLimit, async (req, res) => {
    try {
      const nodeId = String(req.query.node || "").trim();
      if (!nodeId) return res.status(400).json({ error: "node_required" });
      const limitDocs = Number(req.query.limitDocs || 8);
      const limitSnippets = Number(req.query.limitSnippets || 6);
      const collectionId = String(req.query.collection || req.query.collectionId || "trading").trim();
      const detail = await getTradingKnowledgeNodeDetails(nodeId, { limitDocs, limitSnippets, collectionId });
      if (!detail) return res.status(404).json({ error: "node_not_found" });

      let summary = buildTradingNodeSummaryFallback(detail);
      if (process.env.OPENAI_API_KEY) {
        const contextParts = [];
        contextParts.push(`Node: ${detail.type} ${detail.label}`);
        if (detail.sources?.length) {
          contextParts.push("Sources:");
          detail.sources.slice(0, 6).forEach(source => contextParts.push(`- ${source.title || source.key} (${source.count})`));
        }
        if (detail.tags?.length) {
          contextParts.push("Tags:");
          detail.tags.slice(0, 6).forEach(tag => contextParts.push(`- #${tag.tag} (${tag.count})`));
        }
        if (detail.docs?.length) {
          contextParts.push("Documents:");
          detail.docs.slice(0, 6).forEach(doc => contextParts.push(`- ${doc.title || "Doc"} (${doc.occurred_at || ""})`));
        }
        if (detail.snippets?.length) {
          contextParts.push("Snippets:");
          detail.snippets.slice(0, 6).forEach(snippet => contextParts.push(`- ${snippet.text}`));
        }
        try {
          const system = "Summarize the trading knowledge node in 2-3 sentences using only the provided context.";
          const user = `Context:\n${contextParts.join("\n")}`;
          const response = await client.responses.create({
            model: OPENAI_MODEL,
            input: [
              { role: "system", content: [{ type: "input_text", text: system }] },
              { role: "user", content: [{ type: "input_text", text: user }] }
            ],
            max_output_tokens: 220
          });
          summary = response?.output_text?.trim() || summary;
        } catch (err) {
          // fallback to heuristic summary
        }
      }

      res.json({ ...detail, summary });
    } catch (err) {
      res.status(500).json({ error: err?.message || "knowledge_node_failed" });
    }
  });

  app.get("/api/trading/rss/sources", rateLimit, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 100);
      const search = String(req.query.search || "");
      const includeDisabled = String(req.query.includeDisabled || "1") !== "0";
      const collectionId = String(req.query.collection || req.query.collectionId || "trading").trim();
      if (!collectionId || collectionId === "trading") {
        ensureTradingRssSeeded();
      }
      const items = listTradingRssSourcesUi({ limit, search, includeDisabled, collectionId });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err?.message || "rss_sources_list_failed" });
    }
  });

  app.post("/api/trading/rss/sources", rateLimit, async (req, res) => {
    try {
      const parsed = tradingRssSourceSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const source = addTradingRssSource({
        url: parsed.url,
        title: parsed.title,
        tags: parsed.tags || [],
        enabled: parsed.enabled !== false,
        includeForeign: parsed.includeForeign || false,
        collectionId
      });
      res.json({ source });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "rss_source_add_failed" });
    }
  });

  app.patch("/api/trading/rss/sources/:id", rateLimit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const parsed = tradingRssSourceUpdateSchema.parse(req.body || {});
      const source = updateTradingRssSourceUi(id, parsed);
      if (!source) return res.status(404).json({ error: "not_found" });
      res.json({ source });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "rss_source_update_failed" });
    }
  });

  app.delete("/api/trading/rss/sources/:id", rateLimit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const result = removeTradingRssSource(id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err?.message || "rss_source_delete_failed" });
    }
  });

  app.post("/api/trading/rss/crawl", rateLimit, async (req, res) => {
    try {
      const parsed = tradingRssCrawlSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const result = await crawlTradingRssSources({
        force: parsed.force,
        maxItemsPerFeed: parsed.maxItemsPerFeed,
        collectionId
      });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "rss_crawl_failed" });
    }
  });

  app.post("/api/trading/rss/sources/:id/crawl", rateLimit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const parsed = tradingRssCrawlSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const source = listTradingRssSourcesUi({ includeDisabled: true, collectionId }).find(item => item.id === id);
      if (!source) return res.status(404).json({ error: "not_found" });
      const result = await crawlTradingRssSources({
        entries: [source],
        force: parsed.force,
        maxItemsPerFeed: parsed.maxItemsPerFeed,
        collectionId
      });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "rss_crawl_failed" });
    }
  });

  app.post("/api/trading/rss/seed", rateLimit, async (req, res) => {
    try {
      const parsed = tradingRssSeedSchema.parse(req.body || {});
      const seedUrl = parsed.url || "https://rss.feedspot.com/stock_market_news_rss_feeds/";
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const result = await seedRssSourcesFromFeedspot(seedUrl, { collectionId });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "rss_seed_failed" });
    }
  });

  app.get("/api/trading/rss/items", rateLimit, async (req, res) => {
    try {
      const sourceId = req.query.sourceId ? Number(req.query.sourceId) : undefined;
      const limit = Number(req.query.limit || 50);
      const items = listTradingRssItemsUi({ sourceId, limit });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err?.message || "rss_items_failed" });
    }
  });

  app.get("/api/signals/status", rateLimit, (_req, res) => {
    try {
      const status = getSignalsStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err?.message || "signals_status_failed" });
    }
  });

  app.post("/api/signals/run", rateLimit, async (req, res) => {
    try {
      const parsed = signalsRunSchema.parse(req.body || {});
      const result = await runSignalsIngestion({
        sourceIds: parsed.sourceIds || [],
        force: parsed.force
      });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "signals_run_failed" });
    }
  });

  app.get("/api/signals/docs", rateLimit, (req, res) => {
    try {
      const limit = Number(req.query.limit || 50);
      const offset = Number(req.query.offset || 0);
      const includeStale = String(req.query.includeStale || "0") === "1";
      const includeExpired = String(req.query.includeExpired || "0") === "1";
      const category = String(req.query.category || "");
      const sourceId = String(req.query.sourceId || "");
      const search = String(req.query.search || "");
      const items = listSignals({ limit, offset, includeStale, includeExpired, category, sourceId, search });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err?.message || "signals_docs_failed" });
    }
  });

  app.get("/api/signals/docs/:id", rateLimit, (req, res) => {
    try {
      const docId = String(req.params.id || "").trim();
      if (!docId) return res.status(400).json({ error: "doc_id_required" });
      const doc = getSignalDoc(docId);
      if (!doc) return res.status(404).json({ error: "not_found" });
      res.json({ doc });
    } catch (err) {
      res.status(500).json({ error: err?.message || "signals_doc_failed" });
    }
  });

  app.get("/api/signals/trends", rateLimit, (req, res) => {
    try {
      const runId = String(req.query.runId || "");
      const limit = Number(req.query.limit || 12);
      const items = listSignalsTrends({ runId, limit });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err?.message || "signals_trends_failed" });
    }
  });

  app.get("/api/trading/youtube/sources", rateLimit, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 100);
      const search = String(req.query.search || "");
      const includeDisabled = String(req.query.includeDisabled || "1") !== "0";
      const collectionId = String(req.query.collection || req.query.collectionId || "trading").trim();
      const items = listTradingYoutubeSourcesUi({ limit, search, includeDisabled, collectionId });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err?.message || "youtube_sources_list_failed" });
    }
  });

  app.post("/api/trading/youtube/sources", rateLimit, async (req, res) => {
    try {
      const parsed = tradingYoutubeSourceSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const source = await addTradingYoutubeSource({
        channel: parsed.channel,
        tags: parsed.tags || [],
        enabled: parsed.enabled !== false,
        maxVideos: parsed.maxVideos,
        collectionId
      });
      res.json({ source });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "youtube_source_add_failed" });
    }
  });

  app.patch("/api/trading/youtube/sources/:id", rateLimit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const parsed = tradingYoutubeSourceUpdateSchema.parse(req.body || {});
      const source = updateTradingYoutubeSourceUi(id, parsed);
      if (!source) return res.status(404).json({ error: "not_found" });
      res.json({ source });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "youtube_source_update_failed" });
    }
  });

  app.delete("/api/trading/youtube/sources/:id", rateLimit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      const result = removeTradingYoutubeSource(id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err?.message || "youtube_source_delete_failed" });
    }
  });

  app.post("/api/trading/youtube/crawl", rateLimit, async (req, res) => {
    try {
      const parsed = tradingYoutubeCrawlSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const result = await crawlTradingYoutubeSources({
        force: parsed.force,
        maxVideosPerChannel: parsed.maxVideos,
        maxNewVideosPerChannel: parsed.maxNewVideos,
        collectionId
      });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "youtube_crawl_failed" });
    }
  });

  app.post("/api/trading/youtube/search", rateLimit, async (req, res) => {
    try {
      const parsed = tradingYoutubeSearchSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const result = await discoverTradingYoutubeChannels({
        queries: parsed.queries,
        maxChannels: parsed.maxChannels,
        minSubscribers: parsed.minSubscribers,
        minScore: parsed.minScore,
        autoAdd: parsed.autoAdd,
        collectionId
      });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "youtube_search_failed" });
    }
  });

  app.post("/api/trading/knowledge/ask", rateLimit, async (req, res) => {
    try {
      const parsed = tradingKnowledgeAskSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const base = await queryTradingKnowledge(parsed.question, {
        topK: parsed.topK || 6,
        collectionId: collectionId === "trading" ? undefined : collectionId
      });
      let answer = base.answer;
      if (base.context && process.env.OPENAI_API_KEY) {
        const system = "Answer using ONLY the provided trading knowledge context. If unsure, say you don't know.";
        const user = `Question: ${parsed.question}\n\nContext:\n${base.context}`;
        const response = await client.responses.create({
          model: OPENAI_MODEL,
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] }
          ],
          max_output_tokens: 350
        });
        answer = response?.output_text || answer;
      } else if (base.context) {
        answer = base.context;
      }
      res.json({ answer, citations: base.citations || [], debug: base.debug || {} });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "knowledge_query_failed" });
    }
  });

  app.post("/api/trading/knowledge/ask-deep", rateLimit, async (req, res) => {
    try {
      const parsed = tradingKnowledgeDeepSchema.parse(req.body || {});
      const collectionId = String(req.body?.collection || req.body?.collectionId || "trading").trim();
      const base = await queryTradingKnowledge(parsed.question, {
        topK: parsed.topK || 6,
        collectionId: collectionId === "trading" ? undefined : collectionId
      });
      const allowFallback = parsed.allowFallback !== false;
      let answer = base.answer;
      let source = base.context ? "rag" : "rag_empty";

      if (process.env.OPENAI_API_KEY && allowFallback) {
        const system = "You are a trading education assistant. Use the provided context first. If the context is insufficient, you may answer from general knowledge, but explicitly note when you are doing so.";
        const user = `Question: ${parsed.question}\n\nContext:\n${base.context || "(none)"}`;
        const response = await client.responses.create({
          model: OPENAI_MODEL,
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] }
          ],
          max_output_tokens: 450
        });
        const modelText = response?.output_text || "";
        if (modelText.trim()) {
          answer = modelText.trim();
          source = base.context ? "rag+llm" : "llm";
        }
      } else if (base.context) {
        answer = base.context;
        source = "rag";
      }

      res.json({ answer, citations: base.citations || [], debug: base.debug || {}, source });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "knowledge_query_failed" });
    }
  });

  app.post("/api/trading/outcome", rateLimit, async (req, res) => {
    try {
      const parsed = tradingOutcomeSchema.parse(req.body || {});
      const analysis = await analyzeTradeOutcome(parsed);
      const result = await recordTradeAnalysis({
        outcome: parsed,
        analysis,
        source: "manual"
      });
      res.json({ ok: true, analysis, rag: result });
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "trade_outcome_failed" });
    }
  });

  app.post("/api/trading/scenarios/run", rateLimit, async (req, res) => {
    try {
      const parsed = tradingScenarioSchema.parse(req.body || {});
      const result = await runTradingScenario({
        assetClass: parsed.assetClass || "all",
        windowDays: parsed.windowDays || 30,
        picks: parsed.picks || [],
        useDailyPicks: Boolean(parsed.useDailyPicks)
      });
      res.json(result);
    } catch (err) {
      if (err?.issues) {
        return res.status(400).json({ error: "invalid_request", detail: err.issues });
      }
      res.status(500).json({ error: err?.message || "scenario_run_failed" });
    }
  });

  app.get("/api/trading/scenarios/detail", rateLimit, async (req, res) => {
    try {
      const symbol = String(req.query.symbol || "").trim();
      if (!symbol) return res.status(400).json({ error: "symbol_required" });
      const assetClass = String(req.query.assetClass || "stock");
      const windowDays = Number(req.query.windowDays || 30);
      const detail = await getScenarioDetail({ symbol, assetClass, windowDays });
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: err?.message || "scenario_detail_failed" });
    }
  });

  app.get("/api/trading/scenarios", rateLimit, async (req, res) => {
    try {
      const limit = Number(req.query.limit || 10);
      const items = listTradingScenarios({ limit });
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err?.message || "scenario_list_failed" });
    }
  });

  app.get("/api/trading/daily-picks/preview", rateLimit, async (_req, res) => {
  try {
    const picks = await generateDailyPicks();
    res.json({ picks });
  } catch (err) {
    res.status(500).json({ error: err?.message || "daily_picks_failed" });
  }
});

app.post("/api/trading/daily-picks/run", rateLimit, async (req, res) => {
  try {
    const force = Boolean(req.body?.force);
    const result = await runDailyPicksEmail({ force });
    if (result?.approval) {
      return res.status(403).json(result);
    }
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err?.message || "daily_picks_send_failed", reason: err.reason });
  }
});

app.get("/api/trading/stream", rateLimit, (req, res) => {
  const symbol = String(req.query.symbol || "").toUpperCase();
  const interval = String(req.query.interval || "1m").toLowerCase();
  const feed = String(req.query.feed || process.env.ALPACA_DATA_FEED || "iex");
  if (!symbol) {
    return res.status(400).json({ error: "symbol_required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  let stream = null;
  try {
    stream = createAlpacaTradeStream({
      symbol,
      feed,
      onStatus: (status) => send({ type: "status", status }),
      onTrade: (trade) => send({ type: "trade", symbol, interval, ...trade }),
      onError: (err) => send({ type: "error", message: err?.message || "alpaca_stream_error" })
    });
  } catch (err) {
    clearInterval(heartbeat);
    send({ type: "error", message: err?.message || "alpaca_stream_init_failed" });
    return res.end();
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    if (stream?.close) stream.close();
    res.end();
  });
});

app.get("/api/rag/meetings", (req, res) => {
  try {
    const type = String(req.query.type || "all");
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    const search = String(req.query.search || "");
    const participant = String(req.query.participant || "");
    const meetings = listMeetings({ type, limit, offset, search, participant });
    res.json({ meetings });
  } catch (err) {
    res.status(500).json({ error: err?.message || "rag_meetings_failed" });
  }
});

app.get("/api/fireflies/graph", (req, res) => {
  try {
    const limit = Number(req.query.limit || 500);
    const graph = getFirefliesGraph({ limit });
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err?.message || "fireflies_graph_failed" });
  }
});

function buildNodeSummaryFallback(detail) {
  if (!detail) return "";
  const meetingCount = detail.meetings?.length || 0;
  const titleList = (detail.meetings || []).slice(0, 3).map(m => m.title || "Meeting").join("; ");
  const snippet = detail.snippets?.[0]?.text || "";
  const trimmedSnippet = snippet ? snippet.replace(/\s+/g, " ").slice(0, 220) : "";
  const parts = [
    `Appears in ${meetingCount} meeting(s).`,
    titleList ? `Sample titles: ${titleList}.` : "",
    trimmedSnippet ? `Example snippet: ${trimmedSnippet}${trimmedSnippet.length >= 220 ? "…" : ""}` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

app.get("/api/fireflies/node", async (req, res) => {
  try {
    const nodeId = String(req.query.node || "").trim();
    if (!nodeId) return res.status(400).json({ error: "node_required" });
    const limitMeetings = Number(req.query.limitMeetings || 8);
    const limitSnippets = Number(req.query.limitSnippets || 6);
    const detail = getFirefliesNodeDetails(nodeId, { limitMeetings, limitSnippets });
    if (!detail) return res.status(404).json({ error: "node_not_found" });

    let summary = buildNodeSummaryFallback(detail);
    if (process.env.OPENAI_API_KEY) {
      const contextParts = [];
      contextParts.push(`Node: ${detail.type} ${detail.label}`);
      if (detail.meetings?.length) {
        contextParts.push("Meeting titles:");
        detail.meetings.slice(0, 6).forEach(m => contextParts.push(`- ${m.title || "Meeting"} (${m.occurred_at || ""})`));
      }
      if (detail.snippets?.length) {
        contextParts.push("Snippets:");
        detail.snippets.slice(0, 6).forEach(s => contextParts.push(`- ${s.text}`));
      }
      try {
        const system = "Summarize the node in 2-3 sentences using only the provided context.";
        const user = `Context:\n${contextParts.join("\n")}`;
        const response = await client.responses.create({
          model: OPENAI_MODEL,
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] }
          ],
          max_output_tokens: 220
        });
        summary = response?.output_text?.trim() || summary;
      } catch (err) {
        // fallback to heuristic summary
      }
    }

    res.json({ ...detail, summary });
  } catch (err) {
    res.status(500).json({ error: err?.message || "fireflies_node_failed" });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const parsed = feedbackSchema.parse(req.body || {});
    const stored = await recordFeedback({
      messageId: parsed.messageId,
      source: parsed.source || "chat",
      rating: parsed.rating,
      question: parsed.question || "",
      answer: parsed.answer || "",
      citations: parsed.citations || []
    });

    const ratingTag = parsed.rating === "down" ? "thumbs_down" : "thumbs_up";
    const sourceTag = String(parsed.source || "chat").toLowerCase();
    const memoryLines = [
      `Feedback: ${ratingTag}`,
      sourceTag ? `Source: ${sourceTag}` : "",
      parsed.question ? `Question: ${parsed.question}` : "",
      parsed.answer ? `Answer: ${parsed.answer}` : ""
    ].filter(Boolean);

    addMemoryIndexed({
      role: "system",
      content: memoryLines.join("\n"),
      tags: `feedback,${ratingTag},source_${sourceTag}`
    });

    res.json({ ok: true, feedbackId: stored.id, meetingId: stored.meetingId, chunkId: stored.chunkId });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    res.status(500).json({ error: err?.message || "feedback_failed" });
  }
});

app.post("/api/action/plan", rateLimit, async (req, res) => {
  try {
    const parsed = actionPlanSchema.parse(req.body || {});
    const result = await planAction({
      instruction: parsed.instruction,
      startUrl: parsed.startUrl || ""
    });
    res.json(result);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    res.status(500).json({ error: err?.message || "action_plan_failed" });
  }
});

app.post("/api/action/run", rateLimit, async (req, res) => {
  try {
    const parsed = actionRunSchema.parse(req.body || {});
    const result = await executor.callTool({
      name: "action.run",
      params: parsed,
      context: {
        userId: getUserId(req),
        workspaceId: getWorkspaceId(req),
        correlationId: req.headers["x-correlation-id"] || ""
      }
    });
    res.json(result);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    const status = err.status || 500;
    res.status(status).json({ error: err?.message || "action_run_failed" });
  }
});

app.get("/api/action/runs/:id", rateLimit, (req, res) => {
  const run = getActionRun(req.params.id);
  if (!run) return res.status(404).json({ error: "run_not_found" });
  res.json(run);
});

app.get("/api/action/runs/:id/artifacts/:file", rateLimit, (req, res) => {
  const runId = req.params.id;
  const file = req.params.file;
  const dir = getRunDir(runId);
  const filePath = getRunFilePath(runId, file);
  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir)) {
    return res.status(403).json({ error: "invalid_artifact_path" });
  }
  if (!fs.existsSync(resolvedFile)) {
    return res.status(404).json({ error: "artifact_not_found" });
  }
  res.sendFile(resolvedFile);
});

app.get("/api/teach/macros", rateLimit, (_req, res) => {
  const macros = listMacros().map(macro => ({
    ...macro,
    params: extractMacroParams(macro)
  }));
  res.json({ macros });
});

app.get("/api/teach/macros/:id", rateLimit, (req, res) => {
  const macro = getMacro(req.params.id);
  if (!macro) return res.status(404).json({ error: "macro_not_found" });
  res.json({ macro, params: extractMacroParams(macro) });
});

app.post("/api/teach/macros", rateLimit, (req, res) => {
  try {
    const parsed = macroSchema.parse(req.body || {});
    const macro = saveMacro(parsed);
    res.json({ macro });
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    res.status(500).json({ error: err?.message || "macro_save_failed" });
  }
});

app.delete("/api/teach/macros/:id", rateLimit, (req, res) => {
  const ok = deleteMacro(req.params.id);
  if (!ok) return res.status(404).json({ error: "macro_not_found" });
  res.json({ ok: true });
});

app.post("/api/teach/macros/:id/run", rateLimit, async (req, res) => {
  try {
    const macro = getMacro(req.params.id);
    if (!macro) return res.status(404).json({ error: "macro_not_found" });
    const parsed = macroRunSchema.parse(req.body || {});
    const plan = applyMacroParams(macro, parsed.params || {});
    const result = await executor.callTool({
      name: "action.run",
      params: { ...plan, async: parsed.async !== false },
      context: {
        userId: getUserId(req),
        workspaceId: getWorkspaceId(req),
        correlationId: req.headers["x-correlation-id"] || ""
      }
    });
    res.json(result);
  } catch (err) {
    if (err?.issues) {
      return res.status(400).json({ error: "invalid_request", detail: err.issues });
    }
    const status = err.status || 500;
    res.status(status).json({ error: err?.message || "macro_run_failed" });
  }
});

app.get("/api/pairings", rateLimit, (_req, res) => {
  res.json(listPairings());
});

app.post("/api/pairings/:id/approve", rateLimit, (req, res) => {
  const approved = approvePairing(req.params.id, getUserId(req));
  if (!approved) return res.status(404).json({ error: "pairing_not_found" });
  res.json({ ok: true, approved });
});

app.post("/api/pairings/:id/deny", rateLimit, (req, res) => {
  const denied = denyPairing(req.params.id);
  if (!denied) return res.status(404).json({ error: "pairing_not_found" });
  res.json({ ok: true, denied });
});

app.get("/api/connections", rateLimit, (req, res) => {
  const connections = buildConnections(getUserId(req));
  const panic = getRuntimeFlags();
  res.json({ connections, panic: { outboundToolsDisabled: Boolean(panic.outboundToolsDisabled) } });
});

app.post("/api/connections/panic", rateLimit, (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const flags = setRuntimeFlag("outboundToolsDisabled", enabled);
  writeAudit({
    type: "panic_switch",
    at: new Date().toISOString(),
    enabled,
    userId: getUserId(req)
  });
  res.json({ ok: true, enabled: Boolean(flags.outboundToolsDisabled) });
});

app.post("/api/connections/:id/revoke", rateLimit, async (req, res) => {
  const id = req.params.id;
  try {
    if (id === "google") {
      await disconnectGoogle(getUserId(req));
    } else if (id === "facebook" || id === "instagram") {
      const meta = getProvider("meta", getUserId(req)) || {};
      const next = { ...meta };
      delete next[id];
      setProvider("meta", Object.keys(next).length ? next : null, getUserId(req));
    } else {
      setProvider(id, null, getUserId(req));
    }
    writeAudit({
      type: "connection_revoked",
      at: new Date().toISOString(),
      provider: id,
      userId: getUserId(req)
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || "connection_revoke_failed" });
  }
});

app.get("/api/canvas", rateLimit, (req, res) => {
  const workspaceId = getWorkspaceId(req);
  res.json({ cards: listCanvasCards(workspaceId) });
});

app.post("/api/canvas/update", rateLimit, (req, res) => {
  const { workspaceId, cardId, content, kind } = req.body || {};
  if (!cardId) return res.status(400).json({ error: "cardId_required" });
  const record = upsertCanvasCard({
    workspaceId: workspaceId || getWorkspaceId(req),
    cardId: String(cardId),
    kind: kind ? String(kind) : undefined,
    content: content ?? {}
  });
  res.json({ ok: true, card: record });
});

app.post("/api/integrations/telegram/webhook", rateLimit, async (req, res) => {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
      return res.status(401).json({ error: "telegram_secret_invalid" });
    }
    const update = req.body || {};
    const message = update.message || update.edited_message;
    const text = message?.text || message?.caption || "";
    const chatId = message?.chat?.id;
    const senderId = message?.from?.id ? String(message.from.id) : "";
    const senderName = message?.from?.username || message?.from?.first_name || "";
    if (text && chatId) {
      await handleInboundMessage({
        channel: "telegram",
        senderId,
        senderName,
        text,
        workspaceId: "default",
        chatId,
        reply: async (replyText) => {
          const result = await executeAction({
            actionType: "messaging.telegramSend",
            params: { chatId, text: replyText },
            context: { userId: "system" },
            outboundTargets: ["https://api.telegram.org"],
            summary: "Reply to Telegram message",
            handler: async () => sendTelegramMessage(chatId, replyText)
          });
          if (result.status === "approval_required") {
            return;
          }
        }
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || "telegram_webhook_failed" });
  }
});

app.post("/api/integrations/slack/events", rateLimit, async (req, res) => {
  if (!verifySlackSignature(req)) {
    return res.status(401).json({ error: "slack_signature_invalid" });
  }
  const body = req.body || {};
  if (body.type === "url_verification") {
    return res.send(body.challenge);
  }
  const event = body.event || {};
  if (event.type === "message" && !event.bot_id && !event.subtype) {
    const senderId = String(event.user || "");
    const senderName = senderId;
    const text = event.text || "";
    const channelId = event.channel;
    if (text && channelId) {
      await handleInboundMessage({
        channel: "slack",
        senderId,
        senderName,
        text,
        workspaceId: "default",
        chatId: channelId,
        reply: async (replyText) => {
          const result = await executeAction({
            actionType: "messaging.slackPost",
            params: { channel: channelId, text: replyText },
            context: { userId: "system" },
            outboundTargets: ["https://slack.com"],
            summary: "Reply to Slack message",
            handler: async () => sendSlackMessage(channelId, replyText)
          });
          if (result.status === "approval_required") {
            return;
          }
        }
      });
    }
  }
  res.json({ ok: true });
});

app.post("/api/integrations/messages/webhook", rateLimit, async (req, res) => {
  try {
    const payload = req.body || {};
    const text = payload.Body || payload.body || "";
    const from = payload.From || payload.from || "";
    if (!from || !text) {
      res.type("text/xml").send("<Response></Response>");
      return;
    }
    const channel = String(from).startsWith("whatsapp:") ? "whatsapp" : "sms";
    await handleInboundMessage({
      channel,
      senderId: String(from),
      senderName: String(from),
      text: String(text),
      workspaceId: "default",
      chatId: String(from),
      reply: async (replyText) => {
        const actionType = channel === "whatsapp" ? "messaging.whatsapp.send" : "messaging.sms.send";
        const outboundTargets = channel === "whatsapp"
          ? ["https://graph.facebook.com", "https://api.twilio.com"]
          : ["https://api.twilio.com"];
        const result = await executeAction({
          actionType,
          params: { to: String(from), text: replyText },
          context: { userId: "system" },
          outboundTargets,
          summary: `Reply to ${channel} message`,
          handler: async () => {
            if (channel === "whatsapp") {
              return await sendWhatsAppMessage(String(from), replyText);
            }
            return await sendSmsMessage(String(from), replyText);
          }
        });
        if (result.status === "approval_required") {
          return;
        }
      }
    });
  } catch (err) {
    console.warn("Twilio webhook failed:", err?.message || err);
  }
  res.type("text/xml").send("<Response></Response>");
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

app.get("/api/assistant/profile", (req, res) => {
  const userId = getUserId(req);
  res.json({ profile: getAssistantProfile(userId) });
});

app.put("/api/assistant/profile", (req, res) => {
  const userId = getUserId(req);
  try {
    const profile = updateAssistantProfile(userId, req.body || {});
    res.json({ profile });
  } catch (err) {
    res.status(400).json({ error: err?.message || "profile_update_failed" });
  }
});

app.get("/api/assistant/tasks", (req, res) => {
  const userId = getUserId(req);
  const { status, limit, offset } = req.query || {};
  const tasks = listAssistantTasks(userId, {
    status: status ? String(status) : "",
    limit: Number(limit || 50),
    offset: Number(offset || 0)
  });
  res.json({ tasks });
});

app.post("/api/assistant/tasks", (req, res) => {
  const userId = getUserId(req);
  try {
    const task = createAssistantTask(userId, req.body || {});
    res.json({ task });
  } catch (err) {
    res.status(400).json({ error: err?.message || "task_create_failed" });
  }
});

app.patch("/api/assistant/tasks", (req, res) => {
  const userId = getUserId(req);
  const { id, ...patch } = req.body || {};
  if (!id) return res.status(400).json({ error: "task_id_required" });
  const task = updateAssistantTask(userId, id, patch);
  if (!task) return res.status(404).json({ error: "task_not_found" });
  res.json({ task });
});

app.get("/api/assistant/proposals", (req, res) => {
  const userId = getUserId(req);
  const { status, limit, offset } = req.query || {};
  const proposals = listAssistantProposals(userId, {
    status: status ? String(status) : "",
    limit: Number(limit || 50),
    offset: Number(offset || 0)
  });
  res.json({ proposals });
});

app.post("/api/assistant/proposals", (req, res) => {
  const userId = getUserId(req);
  const { title, summary, details } = req.body || {};
  if (!title) return res.status(400).json({ error: "proposal_title_required" });
  const approval = createSafetyApproval({
    actionType: "assistant.change_proposal",
    summary: summary || title,
    payloadRedacted: { title, summary: summary || "" },
    createdBy: userId,
    reason: "assistant_change_proposal"
  });
  try {
    const proposal = createAssistantProposal(userId, {
      title,
      summary: summary || "",
      details: details || {},
      status: "pending",
      approvalId: approval?.id || ""
    });
    res.json({ proposal, approval });
  } catch (err) {
    res.status(400).json({ error: err?.message || "proposal_create_failed" });
  }
});

app.patch("/api/assistant/proposals", (req, res) => {
  const userId = getUserId(req);
  const { id, status, decidedBy, reason, ...patch } = req.body || {};
  if (!id) return res.status(400).json({ error: "proposal_id_required" });
  const existing = getAssistantProposal(userId, id);
  if (!existing) return res.status(404).json({ error: "proposal_not_found" });
  const normalizedStatus = status ? String(status).toLowerCase() : "";
  let approval = null;
  if (normalizedStatus === "approved" && existing.approvalId) {
    approval = approveSafetyApproval(existing.approvalId, decidedBy || userId);
    patch.decidedAt = new Date().toISOString();
    patch.decidedBy = decidedBy || userId;
  } else if (normalizedStatus === "rejected" && existing.approvalId) {
    approval = rejectSafetyApproval(existing.approvalId, decidedBy || userId, reason || "");
    patch.decidedAt = new Date().toISOString();
    patch.decidedBy = decidedBy || userId;
  }
  const proposal = updateAssistantProposal(userId, id, { status: normalizedStatus || undefined, ...patch });
  res.json({ proposal, approval });
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

app.get("/api/skill-vault", rateLimit, (_req, res) => {
  res.json({ skills: listSkillVault() });
});

app.get("/api/skill-vault/:id", rateLimit, (req, res) => {
  const entry = getSkillVaultEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: "skill_not_found" });
  res.json(entry);
});

app.post("/api/skill-vault/:id/run", rateLimit, async (req, res) => {
  try {
    const input = req.body?.input || "";
    const result = await executor.callTool({
      name: "skill.vault.run",
      params: { skillId: req.params.id, input },
      context: {
        userId: getUserId(req),
        workspaceId: getWorkspaceId(req),
        correlationId: req.headers["x-correlation-id"] || ""
      }
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "skill_run_failed", detail: err.detail || null });
  }
});

app.post("/api/skill-vault/:id/scan", rateLimit, (_req, res) => {
  const result = scanSkillWithVirusTotal(_req.params.id);
  res.json(result);
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
  let memoryCount = 0;
  let lastMemoryAt = null;
  try {
    const countRow = db.prepare("SELECT COUNT(*) AS c FROM memories").get();
    memoryCount = Number(countRow?.c || 0);
    const lastRow = db.prepare("SELECT created_at FROM memories ORDER BY id DESC LIMIT 1").get();
    lastMemoryAt = lastRow?.created_at || null;
  } catch {
    memoryCount = 0;
    lastMemoryAt = null;
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
    integrations: buildIntegrationsState(getUserId(_req)),
    skills: {
      enabled: getSkillsState().filter(s => s.enabled).length,
      total: getSkillsState().length,
      lastEvent: getSkillEvents()[0] || null
    },
    openai: {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 220)
    },
    memory: {
      count: memoryCount,
      lastAt: lastMemoryAt
    },
    system: {
      platform: process.platform,
      node: process.version
    },
    voiceTest: {
      running: voiceFullTestState.running,
      lastRunAt: voiceFullTestState.lastRunAt,
      ok: voiceFullTestState.report?.ok ?? null,
      passed: voiceFullTestState.report?.passed ?? null,
      total: voiceFullTestState.report?.total ?? null
    }
  });
});

app.get("/api/voice/fulltest", (_req, res) => {
  res.json({
    running: voiceFullTestState.running,
    lastRunAt: voiceFullTestState.lastRunAt,
    report: voiceFullTestState.report
  });
});

app.post("/api/voice/fulltest", async (_req, res) => {
  if (voiceFullTestState.running) {
    return res.status(409).json({
      error: "voice_test_running",
      state: voiceFullTestState
    });
  }
  voiceFullTestState = {
    ...voiceFullTestState,
    running: true
  };
  try {
    const base = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 8790}`;
    const report = await runVoiceFullTest(base);
    voiceFullTestState = {
      running: false,
      lastRunAt: new Date().toISOString(),
      report
    };
    res.json({
      ok: report.ok,
      state: voiceFullTestState
    });
  } catch (err) {
    voiceFullTestState = {
      running: false,
      lastRunAt: new Date().toISOString(),
      report: {
        ok: false,
        total: 0,
        passed: 0,
        failed: 1,
        tests: [{ name: "runner", ok: false, detail: err?.message || "voice_test_failed" }]
      }
    };
    res.status(500).json({
      error: err?.message || "voice_test_failed",
      state: voiceFullTestState
    });
  }
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
        userId: context?.userId || getUserId(req),
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
      createdBy: getUserId(req),
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

app.get("/api/approvals", rateLimit, (req, res) => {
  const status = req.query.status ? String(req.query.status) : "";
  const approvals = listApprovals().filter(approval => !status || approval.status === status);
  res.json({ approvals });
});

app.post("/api/approvals/:id/approve", rateLimit, (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: "admin_required" });
    }
    const safetyApproved = approveSafetyApproval(req.params.id, req.headers["x-user-id"] || req.ip);
    let approved = null;
    try {
      approved = executor.approve(req.params.id, req.headers["x-user-id"] || req.ip);
    } catch (err) {
      if (err?.message !== "approval_not_found") throw err;
    }
    if (safetyApproved?.actionType === "kill_switch.disable") {
      setKillSwitch({ enabled: false, reason: "approved_disable", activatedBy: safetyApproved.decidedBy || "" });
    }
    res.json({ approval: approved || safetyApproved });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_failed" });
  }
});

app.post("/api/approvals/:id/deny", rateLimit, (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: "admin_required" });
    }
    const denied = denyApproval(req.params.id, req.headers["x-user-id"] || req.ip);
    if (!denied) return res.status(404).json({ error: "approval_not_found" });
    rejectSafetyApproval(req.params.id, req.headers["x-user-id"] || req.ip);
    res.json({ approval: denied });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_deny_failed" });
  }
});

app.post("/api/approvals/:id/reject", rateLimit, (req, res) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: "admin_required" });
    }
    const rejected = rejectSafetyApproval(req.params.id, req.headers["x-user-id"] || req.ip, String(req.body?.reason || ""));
    if (!rejected) return res.status(404).json({ error: "approval_not_found" });
    res.json({ approval: rejected });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_reject_failed" });
  }
});

app.post("/api/approvals/:id/execute", rateLimit, async (req, res) => {
  try {
    const { token, context } = req.body || {};
    const result = await executor.execute(req.params.id, token, {
      ...(context || {}),
      userId: context?.userId || getUserId(req)
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "approval_execute_failed" });
  }
});

app.get("/api/safety/policy", rateLimit, (_req, res) => {
  const policy = getPolicy();
  res.json({ policy, meta: getPolicyMeta() });
});

app.post("/api/safety/policy", rateLimit, (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "admin_required" });
  }
  try {
    const nextPolicy = req.body?.policy || req.body || {};
    const current = getPolicy();
    const wasPhiReadonly = current?.memory_tiers?.tier4?.allow_write === false;
    const wantsPhiWrite = nextPolicy?.memory_tiers?.tier4?.allow_write === true;
    if (wasPhiReadonly && wantsPhiWrite) {
      const approval = createSafetyApproval({
        actionType: "memory.tier4.write_enable",
        summary: "Enable PHI write access (tier4)",
        payloadRedacted: { memory_tiers: nextPolicy?.memory_tiers?.tier4 }
      });
      return res.status(403).json({ error: "approval_required", approval });
    }
    const saved = savePolicy(nextPolicy);
    res.json({ ok: true, policy: saved });
  } catch (err) {
    res.status(400).json({ error: err?.message || "policy_save_failed" });
  }
});

app.get("/api/safety/kill-switch", rateLimit, (_req, res) => {
  res.json({ killSwitch: getKillSwitchState() });
});

app.post("/api/safety/kill-switch", rateLimit, (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  if (!enabled) {
    if (!isAdminRequest(req)) {
      const approval = createSafetyApproval({
        actionType: "kill_switch.disable",
        summary: "Disable kill switch",
        payloadRedacted: { enabled: false }
      });
      return res.status(403).json({ error: "approval_required", approval });
    }
  }
  const state = setKillSwitch({
    enabled,
    reason: enabled ? "manual_enable" : "manual_disable",
    activatedBy: getUserId(req)
  });
  res.json({ ok: true, killSwitch: state });
});

app.get("/api/audit", rateLimit, (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "admin_required" });
  }
  const limit = Number(req.query.limit || 100);
  const events = listAuditEvents({ limit });
  res.json({ events });
});

app.get("/api/audit/verify", rateLimit, (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(403).json({ error: "admin_required" });
  }
  const limit = Number(req.query.limit || 5000);
  res.json(verifyAuditChain({ limit }));
});

app.post("/api/integrations/connect", (req, res) => {
  const { provider } = req.body || {};
  const integrationsState = buildIntegrationsState(getUserId(req));
  if (!provider || !integrationsState[provider]) {
    return res.status(400).json({ error: "invalid_provider" });
  }
  setProvider(provider, { connected: true, connectedAt: new Date().toISOString() }, getUserId(req));
  res.json({ ok: true, provider });
});

app.post("/api/integrations/disconnect", (req, res) => {
  const { provider } = req.body || {};
  const integrationsState = buildIntegrationsState(getUserId(req));
  if (!provider || !integrationsState[provider]) {
    return res.status(400).json({ error: "invalid_provider" });
  }
  setProvider(provider, null, getUserId(req));
  res.json({ ok: true, provider });
});

app.get("/api/auth/google/connect", (req, res) => {
  const preset = String(req.query.preset || "core");
  const redirectTo = String(req.query.redirect || "/");
  const uiBase = String(req.query.ui_base || req.query.uiBase || "") || getRequestOrigin(req) || getUiBaseUrl();
  res.redirect(`/api/integrations/google/connect?preset=${encodeURIComponent(preset)}&intent=login&redirect=${encodeURIComponent(redirectTo)}&ui_base=${encodeURIComponent(uiBase)}`);
});

app.get("/api/integrations/google/connect", (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).send("google_oauth_not_configured");
    }
    const preset = String(req.query.preset || "core");
    const intent = String(req.query.intent || "connect");
    const redirectTo = String(req.query.redirect || "/");
    const uiBase = String(req.query.ui_base || req.query.uiBase || "") || getRequestOrigin(req) || getUiBaseUrl();
    const url = connectGoogle(preset, { intent, redirectTo, uiBase });
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
    }, getUserId(req));
    writeAudit({
      type: "connection_token_stored",
      at: new Date().toISOString(),
      provider: "slack",
      userId: getUserId(req)
    });
    res.redirect(`${getUiBaseUrl()}/?integration=slack&status=success`);
  } catch (err) {
    res.redirect(`${getUiBaseUrl()}/?integration=slack&status=error`);
  }
});

app.post("/api/integrations/slack/disconnect", (_req, res) => {
  setProvider("slack", null, getUserId(_req));
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
    }, getUserId(req));
    writeAudit({
      type: "connection_token_stored",
      at: new Date().toISOString(),
      provider: "discord",
      userId: getUserId(req)
    });
    res.redirect(`${getUiBaseUrl()}/?integration=discord&status=success`);
  } catch (err) {
    res.redirect(`${getUiBaseUrl()}/?integration=discord&status=error`);
  }
});

app.post("/api/integrations/discord/disconnect", (_req, res) => {
  setProvider("discord", null, getUserId(_req));
  res.json({ ok: true });
});

app.get("/api/integrations/coinbase/connect", (_req, res) => {
  if (!process.env.COINBASE_CLIENT_ID || !process.env.COINBASE_CLIENT_SECRET) {
    return res.status(400).send("coinbase_oauth_not_configured");
  }
  const redirectUri = process.env.COINBASE_REDIRECT_URI || `${getBaseUrl()}/api/integrations/coinbase/callback`;
  const scopes = normalizeCoinbaseScopes(
    process.env.COINBASE_SCOPES || "wallet:accounts:read wallet:transactions:read"
  );
  const state = createOAuthState("coinbase");
  const url = buildCoinbaseAuthUrl({
    clientId: process.env.COINBASE_CLIENT_ID,
    redirectUri,
    scope: scopes,
    state
  });
  res.redirect(url);
});

app.get("/api/integrations/coinbase/callback", async (req, res) => {
  try {
    const { code, state } = req.query || {};
    validateOAuthState("coinbase", String(state || ""));
    const redirectUri = process.env.COINBASE_REDIRECT_URI || `${getBaseUrl()}/api/integrations/coinbase/callback`;
    const token = await exchangeCoinbaseCode({
      clientId: process.env.COINBASE_CLIENT_ID,
      clientSecret: process.env.COINBASE_CLIENT_SECRET,
      code: String(code || ""),
      redirectUri
    });
    setProvider("coinbase", {
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      expires_in: token.expires_in || null,
      scope: token.scope || null,
      token_type: token.token_type || null,
      connectedAt: new Date().toISOString()
    }, getUserId(req));
    writeAudit({
      type: "connection_token_stored",
      at: new Date().toISOString(),
      provider: "coinbase",
      userId: getUserId(req)
    });
    res.redirect(`${getUiBaseUrl()}/?integration=coinbase&status=success`);
  } catch (err) {
    res.redirect(`${getUiBaseUrl()}/?integration=coinbase&status=error`);
  }
});

app.post("/api/integrations/coinbase/disconnect", async (req, res) => {
  const stored = getProvider("coinbase", getUserId(req));
  if (stored?.access_token && process.env.COINBASE_CLIENT_ID && process.env.COINBASE_CLIENT_SECRET) {
    await revokeCoinbaseToken({
      clientId: process.env.COINBASE_CLIENT_ID,
      clientSecret: process.env.COINBASE_CLIENT_SECRET,
      token: stored.access_token
    }).catch(() => {});
  }
  setProvider("coinbase", null, getUserId(req));
  res.json({ ok: true });
});

app.get("/api/integrations/robinhood/connect", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Connect Robinhood</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; background: #f8fafc; }
      .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; max-width: 480px; margin: 0 auto; }
      label { display: block; font-size: 12px; color: #475569; margin-bottom: 6px; }
      input { width: 100%; padding: 8px; border: 1px solid #cbd5f5; border-radius: 8px; }
      button { margin-top: 12px; padding: 8px 12px; border-radius: 8px; border: 1px solid #0ea5e9; background: #e0f2fe; }
      .note { font-size: 12px; color: #64748b; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h3>Robinhood (Experimental)</h3>
      <p class="note">Paste a session token or API token. Stored locally and encrypted.</p>
      <form method="POST" action="/api/integrations/robinhood/connect">
        <label>Access Token</label>
        <input name="access_token" type="password" placeholder="token..." required />
        <button type="submit">Save Connection</button>
      </form>
    </div>
  </body>
</html>`);
});

app.post("/api/integrations/robinhood/connect", (req, res) => {
  const token = String(req.body?.access_token || "").trim();
  if (!token) {
    return res.status(400).send("token_required");
  }
  setProvider("robinhood", {
    access_token: token,
    connectedAt: new Date().toISOString(),
    mode: "manual"
  }, getUserId(req));
  writeAudit({
    type: "connection_token_stored",
    at: new Date().toISOString(),
    provider: "robinhood",
    userId: getUserId(req)
  });
  res.redirect(`${getUiBaseUrl()}/?integration=robinhood&status=success`);
});

app.post("/api/integrations/robinhood/disconnect", (req, res) => {
  setProvider("robinhood", null, getUserId(req));
  res.json({ ok: true });
});

app.get("/api/integrations/amazon/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "query_required" });
  searchAmazonItems({ keywords: q })
    .then(data => res.json({ results: data.items || [], raw: data.raw || null }))
    .catch(err => res.status(500).json({ error: err?.message || "amazon_paapi_failed" }));
});

app.post("/api/integrations/amazon/research", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    const budget = req.body?.budget;
    const limit = Number(req.body?.limit || 8);
    if (!query) return res.status(400).json({ error: "query_required" });
    const report = await runProductResearch({
      query,
      budget,
      limit,
      openaiClient: process.env.OPENAI_API_KEY ? client : null,
      model: OPENAI_MODEL
    });
    res.json({ ok: true, report });
  } catch (err) {
    res.status(500).json({ error: err?.message || "amazon_research_failed" });
  }
});

app.post("/api/integrations/amazon/cart/add", (req, res) => {
  try {
    const asin = String(req.body?.asin || "").trim();
    const quantity = Number(req.body?.quantity || 1);
    if (!asin) return res.status(400).json({ error: "asin_required" });
    const addToCartUrl = buildAmazonAddToCartUrl({ asin, quantity });
    res.json({
      ok: true,
      asin,
      quantity: Math.max(1, Math.min(10, Math.floor(quantity) || 1)),
      addToCartUrl,
      note: "Open this URL while signed in to Amazon to add to cart."
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "amazon_cart_add_failed" });
  }
});

app.get("/api/integrations/weather/current", async (req, res) => {
  try {
    const location = String(req.query.location || process.env.DEFAULT_WEATHER_LOCATION || "").trim();
    if (!location) return res.status(400).json({ error: "location_required" });
    const weather = await fetchCurrentWeather(location);
    res.json(weather);
  } catch (err) {
    res.status(500).json({ error: err?.message || "weather_fetch_failed" });
  }
});

app.get("/api/integrations/web/search", async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || "").trim();
    const limit = Number(req.query.limit || 5);
    if (!query) return res.status(400).json({ error: "query_required" });
    const results = await searchWeb(query, limit);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err?.message || "web_search_failed" });
  }
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
    storeMetaToken(String(product || "facebook"), token, getUserId(req));
    res.redirect(`${getUiBaseUrl()}/?integration=meta&status=success`);
  } catch (err) {
    res.redirect(`${getUiBaseUrl()}/?integration=meta&status=error`);
  }
});

app.post("/api/integrations/meta/disconnect", (_req, res) => {
  setProvider("meta", null, getUserId(_req));
  res.json({ ok: true });
});

app.get("/api/integrations/facebook/profile", async (req, res) => {
  const token = getMetaToken("facebook", getUserId(req));
  if (!token) return res.status(400).json({ error: "facebook_not_connected" });
  const r = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${encodeURIComponent(token)}`);
  const data = await r.json();
  if (data.error) return res.status(500).json({ error: data.error.message || "facebook_profile_failed" });
  res.json(data);
});

app.get("/api/integrations/facebook/posts", async (req, res) => {
  const token = getMetaToken("facebook", getUserId(req));
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
    // store token in persistent store
    await (async () => {
      const { setProvider } = await import("./integrations/store.js");
      let email = null;
      let name = null;
      let picture = null;
      let userId = null;
      try {
        const info = await fetchGoogleUserInfo(token.access_token);
        email = info?.email || null;
        name = info?.name || info?.given_name || null;
        picture = info?.picture || null;
        userId = info?.id || info?.email || null;
      } catch {
        // ignore userinfo errors
      }
      const effectiveUserId = userId || `google_${Date.now()}`;
      const existing = getProvider("google", effectiveUserId) || {};
      setProvider("google", {
        ...existing,
        ...token,
        refresh_token: token.refresh_token || existing.refresh_token,
        scope: token.scope || existing.scope,
        email: email || existing.email,
        name: name || existing.name,
        picture: picture || existing.picture,
        connectedAt: new Date().toISOString()
      }, effectiveUserId);
      writeAudit({
        type: "connection_token_stored",
        at: new Date().toISOString(),
        provider: "google",
        userId: effectiveUserId
      });

      const sessionId = createSession({
        id: effectiveUserId,
        email,
        name,
        picture,
        workspaceId: effectiveUserId
      });
      setSessionCookie(res, sessionId);
    })();
    const uiBase = token?.meta?.uiBase || process.env.WEB_UI_URL || "http://localhost:3000";
    const redirectTo = token?.meta?.redirectTo || "/";
    res.redirect(`${uiBase}${redirectTo}?integration=google&status=success`);
  } catch (err) {
    const uiBase = process.env.WEB_UI_URL || "http://localhost:3000";
    res.redirect(`${uiBase}/?integration=google&status=error`);
  }
});

app.get("/api/integrations/google/status", async (req, res) => {
  try {
    const status = getGoogleStatus(getUserId(req));
    res.json({ ok: status.connected, ...status });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message || "google_not_connected" });
  }
});

app.post("/api/integrations/google/disconnect", async (req, res) => {
  try {
    const result = await disconnectGoogle(getUserId(req));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "google_disconnect_failed" });
  }
});

app.post("/api/integrations/google/docs/create", async (req, res) => {
  try {
    const { title, content } = req.body || {};
    const doc = await createGoogleDoc(title || "Aika Notes", content || "", getUserId(req));
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
    const result = await appendGoogleDoc(documentId, content, getUserId(req));
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_docs_append_failed" });
  }
});

app.post("/api/integrations/google/drive/upload", async (req, res) => {
  try {
    const { name, content, mimeType } = req.body || {};
    if (!name || !content) return res.status(400).json({ error: "name_and_content_required" });
    const file = await uploadDriveFile(name, content, mimeType || "text/plain", getUserId(req));
    res.json({ ok: true, file });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_drive_upload_failed" });
  }
});

app.get("/api/integrations/google/drive/list", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const data = await listDriveFiles("trashed=false", limit, getUserId(req));
    res.json({ files: data.files || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_drive_list_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/docs/get", async (req, res) => {
  try {
    const docId = req.query.docId;
    if (!docId) return res.status(400).json({ error: "docId_required" });
    const doc = await getGoogleDoc(String(docId), getUserId(req));
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
    const data = await getSheetValues(String(spreadsheetId), String(range), getUserId(req));
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
    const data = await appendSheetValues(String(spreadsheetId), String(range), values, getUserId(req));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_sheets_append_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/calendar/next", async (req, res) => {
  try {
    const max = Number(req.query.max || 10);
    const data = await listCalendarEvents(max, getUserId(req));
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
    const data = await createCalendarEvent(payload, getUserId(req));
    res.json({ event: data });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_calendar_create_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/slides/get", async (req, res) => {
  try {
    const presentationId = req.query.presentationId;
    if (!presentationId) return res.status(400).json({ error: "presentationId_required" });
    const data = await getSlidesPresentation(String(presentationId), getUserId(req));
    res.json({ title: data.title, slideCount: (data.slides || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_slides_get_failed", detail: err.detail || null });
  }
});

app.get("/api/integrations/google/meet/spaces", async (_req, res) => {
  try {
    const data = await listMeetSpaces(getUserId(req));
    res.json({ spaces: data.spaces || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || "google_meet_list_failed", detail: err.detail || null });
  }
});

app.post("/api/integrations/google/meet/spaces", async (req, res) => {
  try {
    const data = await createMeetSpace(req.body || {}, getUserId(req));
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

app.get("/api/integrations/plex/identity", async (req, res) => {
  try {
    const xml = await fetchPlexIdentity();
    setProvider("plex", { connected: true, connectedAt: new Date().toISOString() }, getUserId(req));
    res.type("application/xml").send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message || "plex_failed" });
  }
});

app.post("/api/integrations/slack/post", async (req, res) => {
  try {
    const { channel, text } = req.body || {};
    if (!channel || !text) return res.status(400).json({ error: "channel_and_text_required" });
    const result = await executeAction({
      actionType: "messaging.slackPost",
      params: { channel, text },
      context: { userId: getUserId(req), sessionId: req.aikaSessionId },
      outboundTargets: ["https://slack.com"],
      summary: `Send Slack message to ${channel}`,
      handler: async () => {
        const data = await sendSlackMessage(channel, text);
        setProvider("slack", { connected: true, connectedAt: new Date().toISOString() }, getUserId(req));
        return data;
      }
    });
    if (result.status === "approval_required") {
      return res.status(403).json(result);
    }
    res.json({ ok: true, data: result.data });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "slack_failed", reason: err.reason });
  }
});

app.post("/api/integrations/telegram/send", async (req, res) => {
  try {
    const { chatId, text } = req.body || {};
    if (!chatId || !text) return res.status(400).json({ error: "chatId_and_text_required" });
    const result = await executeAction({
      actionType: "messaging.telegramSend",
      params: { chatId, text },
      context: { userId: getUserId(req), sessionId: req.aikaSessionId },
      outboundTargets: ["https://api.telegram.org"],
      summary: "Send Telegram message",
      handler: async () => {
        const data = await sendTelegramMessage(chatId, text);
        setProvider("telegram", { connected: true, connectedAt: new Date().toISOString() }, getUserId(req));
        return data;
      }
    });
    if (result.status === "approval_required") {
      return res.status(403).json(result);
    }
    res.json({ ok: true, data: result.data });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "telegram_failed", reason: err.reason });
  }
});

app.post("/api/integrations/discord/send", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "text_required" });
    const result = await executeAction({
      actionType: "messaging.discordSend",
      params: { text },
      context: { userId: getUserId(req), sessionId: req.aikaSessionId },
      outboundTargets: ["https://discord.com"],
      summary: "Send Discord message",
      handler: async () => {
        const data = await sendDiscordMessage(text);
        setProvider("discord", { connected: true, connectedAt: new Date().toISOString() }, getUserId(req));
        return data;
      }
    });
    if (result.status === "approval_required") {
      return res.status(403).json(result);
    }
    res.json({ ok: true, data: result.data });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "discord_failed", reason: err.reason });
  }
});

app.post("/api/integrations/whatsapp/send", async (req, res) => {
  try {
    const { to, text } = req.body || {};
    if (!text) return res.status(400).json({ error: "text_required" });
    const result = await executeAction({
      actionType: "messaging.whatsapp.send",
      params: { to, text },
      context: { userId: getUserId(req), sessionId: req.aikaSessionId },
      outboundTargets: ["https://graph.facebook.com", "https://api.twilio.com"],
      summary: "Send WhatsApp message",
      handler: async () => {
        return await sendWhatsAppMessage(to || process.env.WHATSAPP_TO || process.env.TWILIO_WHATSAPP_TO, text);
      }
    });
    if (result.status === "approval_required") {
      return res.status(403).json(result);
    }
    res.json({ ok: true, data: result.data });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "whatsapp_failed", reason: err.reason });
  }
});

app.post("/api/integrations/messages/send", async (req, res) => {
  try {
    const { to, text } = req.body || {};
    if (!text) return res.status(400).json({ error: "text_required" });
    const result = await executeAction({
      actionType: "messaging.sms.send",
      params: { to, text },
      context: { userId: getUserId(req), sessionId: req.aikaSessionId },
      outboundTargets: ["https://api.twilio.com"],
      summary: "Send SMS message",
      handler: async () => {
        return await sendSmsMessage(to || process.env.TWILIO_SMS_TO, text);
      }
    });
    if (result.status === "approval_required") {
      return res.status(403).json(result);
    }
    res.json({ ok: true, data: result.data });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "messages_failed", reason: err.reason });
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
      context: { userId: getUserId(req), source: "agent", correlationId: req.headers["x-correlation-id"] || "" }
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

  addMemoryIndexed({
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
  addMemoryIndexed({
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
