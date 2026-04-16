import fs from "node:fs";
import { getOpenAIClient } from "../src/llm/openaiClient.js";
import { readWavMeta } from "./wav_meta.js";

const OPENAI_TTS_MODEL = String(process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts").trim();
const VALID_OPENAI_VOICES = new Set(["alloy", "ash", "ballad", "cedar", "coral", "echo", "marin", "onyx", "sage", "shimmer", "verse"]);

const STYLE_TO_VOICE = {
  brat_baddy: "coral",
  brat_soft: "sage",
  brat_firm: "ash",
  nocturne_hostess: "marin",
  nocturne_velvet: "shimmer",
  nocturne_command: "cedar"
};

function resolveVoice(style, preferredVoice) {
  const cleaned = String(preferredVoice || "").trim().toLowerCase();
  if (cleaned && VALID_OPENAI_VOICES.has(cleaned)) return cleaned;
  return STYLE_TO_VOICE[String(style || "").trim()] || "coral";
}

function buildInstructions(style, promptText) {
  const base = {
    brat_baddy:
      "Speak as AIKA with playful swagger, crisp diction, confident timing, and controlled teasing energy. Keep it human and conversational, not cartoonish.",
    brat_soft:
      "Speak as AIKA with warm reassurance, soft edges, intimate clarity, and steady pacing. Keep the delivery human, grounded, and close.",
    brat_firm:
      "Speak as AIKA with concise authority, clean pacing, and decisive sentence endings. Sound composed and direct, never harsh or robotic.",
    nocturne_hostess:
      "Speak as AIKA Nocturne with an original dark-glamour horror-hostess presence: feminine adult voice, richer velvet texture, warm dusky low-to-mid register, elegant phrasing, precise diction, dry wit, restrained sensuality, and calm command. Sound human, intimate, and grounded, like a real woman speaking close across a room. Avoid masculine tone, avoid imitation of any real person, avoid chirpy assistant energy, and avoid broad camp or cartoon delivery.",
    nocturne_velvet:
      "Speak as AIKA Nocturne in a softer after-hours register: feminine, warm, velvety, close, elegant, and emotionally attentive. Use calm pacing, smooth phrase endings, and subtle amusement. Keep it intimate and human, never breathy, sing-song, sleepy, or masculine.",
    nocturne_command:
      "Speak as AIKA Nocturne with executive control: feminine dark-glamour composure, measured authority, clipped precision, and calm confidence. Keep the energy restrained, focused, intimate, and unmistakably human."
  }[String(style || "").trim()] || "Speak as AIKA with clear, warm, articulate delivery that sounds human and composed.";

  const custom = String(promptText || "").trim();
  return custom ? `${base} ${custom}` : base;
}

export async function generateWithOpenAI({
  text,
  outputPath,
  format = "wav",
  style = "nocturne_hostess",
  promptText = "",
  voiceName = ""
}) {
  const client = getOpenAIClient();
  const responseFormat = format === "mp3" ? "mp3" : "wav";
  const voice = resolveVoice(style, voiceName);
  const response = await client.audio.speech.create({
    model: OPENAI_TTS_MODEL,
    voice,
    input: String(text || ""),
    response_format: responseFormat,
    instructions: buildInstructions(style, promptText)
  });

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

  let sampleRate = null;
  let duration = null;
  if (responseFormat === "wav" && fs.existsSync(outputPath)) {
    const meta = readWavMeta(outputPath);
    sampleRate = meta.sampleRate || null;
    duration = meta.duration || null;
  }

  return {
    engine: "openai",
    model: OPENAI_TTS_MODEL,
    voice,
    sampleRate,
    duration,
    warnings: []
  };
}
