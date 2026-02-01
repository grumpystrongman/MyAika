import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { listRecordingChunks } from "../storage/recordings.js";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
const SUMMARY_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const WORDS_PER_SECOND = Number(process.env.TRANSCRIPT_WPS || 2.5);

export function combineChunks(recordingId, recordingsDir) {
  const chunks = listRecordingChunks(recordingId);
  if (!chunks.length) return null;
  const buffers = [];
  for (const chunk of chunks) {
    if (fs.existsSync(chunk.storagePath)) {
      buffers.push(fs.readFileSync(chunk.storagePath));
    }
  }
  if (!buffers.length) return null;
  const outputPath = path.join(recordingsDir, recordingId, "recording.webm");
  fs.writeFileSync(outputPath, Buffer.concat(buffers));
  return outputPath;
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
    const result = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL
    });
    const text = result?.text || "";
    const labeled = await labelSpeakersWithLLM(text);
    const segments = labeled ? applyTimestampsToSegments(labeled) : buildSegmentsFromText(text);
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
  const tldr = typeof data.tldr === "string" ? data.tldr.trim() : "";
  const attendees = Array.isArray(data.attendees) ? data.attendees : [];
  const overview = Array.isArray(data.overview) ? data.overview : [];
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  const risks = Array.isArray(data.risks) ? data.risks : [];
  const nextSteps = Array.isArray(data.nextSteps) ? data.nextSteps : [];
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
