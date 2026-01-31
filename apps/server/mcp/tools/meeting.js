import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const meetingsDir = path.join(repoRoot, "data", "meetings");

function ensureDir() {
  if (!fs.existsSync(meetingsDir)) fs.mkdirSync(meetingsDir, { recursive: true });
}

export async function summarizeMeeting({ title, transcript }) {
  if (!transcript || typeof transcript !== "string") {
    const err = new Error("transcript_required");
    err.status = 400;
    throw err;
  }
  ensureDir();
  const meetingId = Date.now().toString(36);
  const safeTitle = typeof title === "string" && title.trim() ? title.trim() : `Meeting ${meetingId}`;

  const prompt = `You are a meeting assistant. Create a polished, shareable meeting summary from the transcript.\n\nTranscript:\n${transcript}\n\nReturn markdown with sections: Summary, Decisions, Action Items (with owners if possible), Key Details, Next Steps. Keep concise.`;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const resp = await client.responses.create({
    model,
    input: prompt,
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 220)
  });
  const output = resp.output_text?.trim() || "";

  const payload = {
    id: meetingId,
    title: safeTitle,
    createdAt: new Date().toISOString(),
    summary: output
  };
  const filePath = path.join(meetingsDir, `${meetingId}.md`);
  fs.writeFileSync(filePath, `# ${safeTitle}\n\n${output}\n`);
  return { ...payload, docUrl: `/api/meetings/${meetingId}` };
}

