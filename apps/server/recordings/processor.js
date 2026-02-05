import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import OpenAI from "openai";
import { listRecordingChunks } from "../storage/recordings.js";
import ffmpegPath from "ffmpeg-static";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const SUMMARY_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const WORDS_PER_SECOND = Number(process.env.TRANSCRIPT_WPS || 2.5);
const STT_FORCE_LANGUAGE = (process.env.STT_FORCE_LANGUAGE || "en").trim();
const STT_MAX_MB = Number(process.env.STT_MAX_MB || 20);
const STT_SEGMENT_SECONDS = Number(process.env.STT_SEGMENT_SECONDS || 600);

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    return ffmpegPath;
  }
  return null;
}

function runFfmpeg(args) {
  const exe = resolveFfmpeg();
  if (!exe) return false;
  const result = spawnSync(exe, args, { stdio: "ignore" });
  return result.status === 0;
}

function isSilentWav(audioPath) {
  try {
    const fd = fs.openSync(audioPath, "r");
    const header = Buffer.alloc(44);
    fs.readSync(fd, header, 0, 44, 0);
    fs.closeSync(fd);
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") return false;
    const pcm = fs.readFileSync(audioPath).subarray(44);
    if (pcm.length < 4) return true;
    const sampleWindow = pcm.subarray(0, Math.min(pcm.length, 120000));
    let nonZero = 0;
    for (let i = 0; i < sampleWindow.length; i++) {
      if (sampleWindow[i] !== 0) nonZero += 1;
    }
    const ratio = nonZero / Math.max(1, sampleWindow.length);
    return ratio < 0.01;
  } catch {
    return false;
  }
}

function isLikelyHallucinatedTranscript(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  // Common whisper silence hallucination snippets seen in noisy/silent chunks.
  if ((/mbc/i.test(t) && /(?:\uB274\uC2A4|\uC774\uB355\uC601)/.test(t)) || /\uC774\uB355\uC601\uC785\uB2C8\uB2E4/.test(t)) return true;
  if (/ignore background noise/i.test(t) || /return only spoken words/i.test(t)) return true;
  const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(t);
  const cjkCount = (t.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  const asciiLetters = (t.match(/[A-Za-z]/g) || []).length;
  const ratioCjk = cjkCount / Math.max(1, t.length);
  // In forced English mode, short non-Latin text is usually a false positive.
  if (STT_FORCE_LANGUAGE.startsWith("en") && hasCjk && (cjkCount >= 2 || asciiLetters < 4) && t.length < 80) return true;
  if (STT_FORCE_LANGUAGE.startsWith("en") && ratioCjk > 0.2 && asciiLetters < 10) return true;
  // Repeated punctuation/fillers from silence.
  if (/^(uh+|um+|hmm+|mm+|ah+|oh+)[.!?]?$/.test(t.toLowerCase())) return true;
  if (/^(thanks for watching|thank you for watching)$/i.test(t)) return true;
  if (words.length <= 2 && t.length < 12) return true;
  return false;
}

export function combineChunks(recordingId, recordingsDir) {
  const chunks = listRecordingChunks(recordingId);
  if (!chunks.length) return null;
  const available = chunks.filter(chunk => fs.existsSync(chunk.storagePath));
  if (!available.length) return null;
  const outputWav = path.join(recordingsDir, recordingId, "recording.wav");
  const listPath = path.join(recordingsDir, recordingId, "chunks.txt");
  const listContent = available
    .map(chunk => `file '${chunk.storagePath.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listContent);
  const ffmpegOk = runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputWav
  ]);
  if (ffmpegOk && fs.existsSync(outputWav)) {
    return outputWav;
  }

  const buffers = [];
  for (const chunk of available) {
    buffers.push(fs.readFileSync(chunk.storagePath));
  }
  if (!buffers.length) return null;
  const outputPath = path.join(recordingsDir, recordingId, "recording.webm");
  fs.writeFileSync(outputPath, Buffer.concat(buffers));
  return outputPath;
}

export function splitAudioForTranscription(audioPath, segmentDir, segmentSeconds) {
  if (!resolveFfmpeg()) return [];
  if (!fs.existsSync(segmentDir)) fs.mkdirSync(segmentDir, { recursive: true });
  const segmentPattern = path.join(segmentDir, "segment-%03d.wav");
  const ok = runFfmpeg([
    "-y",
    "-i",
    audioPath,
    "-f",
    "segment",
    "-segment_time",
    String(segmentSeconds),
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    segmentPattern
  ]);
  if (!ok) return [];
  return fs.readdirSync(segmentDir)
    .filter(name => name.startsWith("segment-") && name.endsWith(".wav"))
    .map(name => path.join(segmentDir, name))
    .sort();
}

function splitSentences(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  return raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
}

function buildSegmentsFromText(text) {
  const sentences = splitSentences(text);
  const segments = [];
  let cursor = 0;
  let speakerIndex = 0;
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    const duration = Math.max(1.2, words.length / WORDS_PER_SECOND);
    const start = cursor;
    const end = cursor + duration;
    const speaker = speakerIndex % 2 === 0 ? "Speaker 1" : "Speaker 2";
    segments.push({
      speaker,
      start,
      end,
      text: sentence.trim()
    });
    cursor = end + 0.2;
    speakerIndex += 1;
  }
  return segments;
}

async function labelSpeakersWithLLM(text) {
  if (!client) return null;
  const prompt = `You are a transcription assistant. Split the transcript into an array of JSON objects with keys:
speaker (string, e.g. "Speaker 1" or inferred name if obvious),
text (string).
Return ONLY valid JSON array, no code fences.

Transcript:
${text}`;
  try {
    const response = await client.responses.create({
      model: SUMMARY_MODEL,
      input: prompt,
      max_output_tokens: 600
    });
    const raw = extractResponseText(response);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(item => ({
      speaker: item.speaker || "Speaker",
      text: String(item.text || "").trim()
    })).filter(item => item.text);
  } catch (err) {
    console.error("Speaker labeling failed:", err);
    return null;
  }
}

function applyTimestampsToSegments(segments) {
  const withTime = [];
  let cursor = 0;
  for (const segment of segments) {
    const words = String(segment.text || "").split(/\s+/).filter(Boolean);
    const duration = Math.max(1.2, words.length / WORDS_PER_SECOND);
    const start = cursor;
    const end = cursor + duration;
    withTime.push({
      speaker: segment.speaker || "Speaker",
      start,
      end,
      text: segment.text || ""
    });
    cursor = end + 0.2;
  }
  return withTime;
}

export async function transcribeAudio(audioPath) {
  if (!audioPath || !fs.existsSync(audioPath)) {
    return { text: "", language: "en", provider: "none", error: "audio_missing" };
  }
  const stat = fs.statSync(audioPath);
  if (stat.size < 256) {
    return {
      text: "",
      language: "en",
      provider: "mock",
      error: "audio_too_short",
      segments: []
    };
  }
  if (stat.size <= 50000 && isSilentWav(audioPath)) {
    return {
      text: "",
      language: STT_FORCE_LANGUAGE || "en",
      provider: "mock",
      error: "audio_too_short",
      segments: []
    };
  }
  if (!client) {
    return {
      text: "",
      language: "en",
      provider: "mock",
      error: "provider_not_configured",
      segments: []
    };
  }
  try {
    const file = fs.createReadStream(audioPath);
    let result;
    try {
      result = await client.audio.transcriptions.create({
        file,
        model: TRANSCRIBE_MODEL,
        language: STT_FORCE_LANGUAGE,
        temperature: 0,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        prompt:
          "Transcribe natural conversational English. Ignore silence/background noise/music and return only spoken words."
      });
    } catch (primaryErr) {
      const msg = String(primaryErr?.message || "").toLowerCase();
      if (!msg.includes("timestamp") && !msg.includes("response_format")) throw primaryErr;
      const fallbackFile = fs.createReadStream(audioPath);
      result = await client.audio.transcriptions.create({
        file: fallbackFile,
        model: TRANSCRIBE_MODEL,
        language: STT_FORCE_LANGUAGE,
        temperature: 0,
        prompt:
          "Transcribe natural conversational English. Ignore silence/background noise/music and return only spoken words."
      });
    }
    const text = String(result?.text || "").trim();
    if (isLikelyHallucinatedTranscript(text)) {
      return {
        text: "",
        language: STT_FORCE_LANGUAGE || result?.language || "en",
        provider: "openai",
        error: "audio_too_short",
        segments: []
      };
    }
    let segments = [];
    if (Array.isArray(result?.segments) && result.segments.length) {
      segments = result.segments
        .map((seg, idx) => {
          const start = Number(seg?.start);
          const end = Number(seg?.end);
          const segText = String(seg?.text || "").trim();
          if (!segText) return null;
          return {
            speaker: `Speaker ${(idx % 2) + 1}`,
            start: Number.isFinite(start) ? start : 0,
            end: Number.isFinite(end) ? end : Math.max(0.2, (Number.isFinite(start) ? start : 0) + segText.split(/\s+/).length / WORDS_PER_SECOND),
            text: segText
          };
        })
        .filter(Boolean);
    }
    if (!segments.length) {
      const labeled = await labelSpeakersWithLLM(text);
      segments = labeled ? applyTimestampsToSegments(labeled) : buildSegmentsFromText(text);
    }
    return {
      text,
      language: result?.language || "en",
      provider: "openai",
      segments
    };
  } catch (err) {
    console.error("Transcription failed:", err);
    return {
      text: "",
      language: "en",
      provider: "error",
      error: "transcription_failed",
      segments: []
    };
  }
}

function pickLinesByKeywords(lines, keywords) {
  return lines.filter(l => keywords.some(k => l.toLowerCase().includes(k)));
}

function heuristicSummary(transcript) {
  const lines = transcript.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const overview = lines.slice(0, 4);
  const decisions = pickLinesByKeywords(lines, ["decid", "agreed", "we will", "approved"]);
  const actions = pickLinesByKeywords(lines, ["action", "todo", "follow up", "next step", "assign"]);
  const risks = pickLinesByKeywords(lines, ["risk", "issue", "blocker", "concern"]);
  const discussionPoints = lines.slice(0, 3).map((line, idx) => ({
    topic: `Topic ${idx + 1}`,
    summary: line
  }));
  const nextSteps = actions.length ? actions : ["Review notes and confirm owners."];
  const tldr = overview.length
    ? overview.slice(0, 2).join(" ")
    : "Meeting summary pending.";
  return {
    tldr,
    overview,
    decisions,
    actionItems: actions,
    risks,
    nextSteps,
    discussionPoints,
    attendees: [],
    nextMeeting: { date: "", goal: "" }
  };
}

export async function summarizeTranscript(transcript, title) {
  if (!client) {
    const data = heuristicSummary(transcript);
    return toSummaryPayload(data, title);
  }
  const prompt = `You are a meeting copilot. Return strict JSON with fields:
tldr (string, 2-3 sentences),
attendees (array of names if mentioned, else empty array),
decisions (array of bullets),
actionItems (array of objects {task, owner, due}),
discussionPoints (array of objects {topic, summary}),
nextSteps (array of bullets),
nextMeeting (object {date, goal} or empty strings).
Keep outputs concise and grounded in the transcript. Use empty strings when unknown.
Return ONLY valid JSON. Do not include code fences.

Title: ${title}
Transcript:
${transcript}`;
  try {
    const response = await client.responses.create({
      model: SUMMARY_MODEL,
      input: prompt,
      max_output_tokens: 800
    });
    const text = extractResponseText(response);
    const parsed = safeJsonParse(text);
    if (!parsed) throw new Error("summary_json_parse_failed");
    return toSummaryPayload(parsed, title);
  } catch (err) {
    console.error("Summary failed:", err);
    const data = heuristicSummary(transcript);
    return toSummaryPayload(data, title);
  }
}

function toSummaryPayload(data, title) {
  const baseTldr = typeof data.tldr === "string" ? data.tldr.trim() : "";
  const attendees = Array.isArray(data.attendees) ? data.attendees : [];
  let overview = Array.isArray(data.overview) ? data.overview.filter(Boolean) : [];
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  const risks = Array.isArray(data.risks) ? data.risks : [];
  const nextSteps = Array.isArray(data.nextSteps) ? data.nextSteps : [];
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
  const actionItems = Array.isArray(data.actionItems)
    ? data.actionItems.map(item => ({
        task: item.task || item.title || item.text || "",
        owner: item.owner || "Unassigned",
        due: item.due || ""
      }))
    : [];
  const discussionPoints = Array.isArray(data.discussionPoints)
    ? data.discussionPoints.map(item => ({
        topic: item.topic || "Discussion",
        summary: item.summary || item.text || ""
      }))
    : [];
  if (!overview.length && discussionPoints.length) {
    overview = discussionPoints
      .map(item => String(item.summary || "").trim())
      .filter(Boolean)
      .slice(0, 4);
  }
  const tldr = baseTldr || (overview.length ? overview.slice(0, 2).join(" ") : "");
  const nextMeeting = data.nextMeeting && typeof data.nextMeeting === "object"
    ? {
        date: data.nextMeeting.date || "",
        goal: data.nextMeeting.goal || ""
      }
    : { date: "", goal: "" };
  const summaryMarkdown = [
    `# ${title}`,
    "",
    "## Meeting Title & Date",
    `- ${title}`,
    "",
    "## Attendees",
    attendees.length ? attendees.map(a => `- ${a}`).join("\n") : "- Not captured",
    "",
    "## ⚡ TL;DR / Executive Summary",
    tldr || (overview.length ? overview.slice(0, 2).join(" ") : "Summary unavailable"),
    "",
    "## 🎯 Key Decisions Made",
    decisions.length ? decisions.map(o => `- ${o}`).join("\n") : "- None captured",
    "",
    "## ✅ Action Items",
    actionItems.length
      ? actionItems.map(a => `- ${a.task} (Owner: ${a.owner}${a.due ? `, Due: ${a.due}` : ""})`).join("\n")
      : "- None captured",
    "",
    "## 💡 Key Discussion Points/Insights",
    discussionPoints.length
      ? discussionPoints.map(p => `- ${p.topic}: ${p.summary}`).join("\n")
      : "- Not captured",
    "",
    "## 📅 Next Steps/Follow-up",
    nextSteps.length ? nextSteps.map(n => `- ${n}`).join("\n") : "- Follow up and confirm owners.",
    nextMeeting?.date || nextMeeting?.goal
      ? `Next meeting: ${nextMeeting.date || "TBD"} — ${nextMeeting.goal || "TBD"}`
      : ""
  ].join("\n");
  return {
    tldr,
    attendees,
    overview,
    decisions,
    actionItems,
    risks,
    nextSteps,
    discussionPoints,
    nextMeeting,
    recommendations,
    summaryMarkdown
  };
}

export function extractEntities({ decisions = [], actionItems = [], risks = [], nextSteps = [] }) {
  const entities = [];
  for (const decision of decisions) {
    entities.push({ type: "decision", value: decision });
  }
  for (const action of actionItems) {
    entities.push({ type: "task", value: action.task, metadata: { owner: action.owner, due: action.due } });
  }
  for (const risk of risks) {
    entities.push({ type: "risk", value: risk });
  }
  for (const step of nextSteps) {
    entities.push({ type: "next_step", value: step });
  }
  return entities;
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

function safeJsonParse(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(text.slice(firstBracket, lastBracket + 1));
      } catch {}
    }
  }
  return null;
}
