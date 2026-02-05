import OpenAI from "openai";
import { createMeetingRecord } from "../../storage/meetings.js";
import { createGoogleDocInFolder, ensureDriveFolderPath } from "../../integrations/google.js";

function summarizeDeterministic({ transcript, title, date, attendees = [] }) {
  const lines = transcript.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const summaryLines = lines.slice(0, 6);
  const decisions = lines.filter(l => /decid|agreed|decision/i.test(l)).slice(0, 6);
  const actions = lines.filter(l => /action|todo|follow up|owner|assign/i.test(l)).slice(0, 8);
  const risks = lines.filter(l => /risk|issue|concern|blocker/i.test(l)).slice(0, 6);
  const quotes = lines.filter(l => /".+"|'.+'/.test(l)).slice(0, 3);
  const md = [
    `# ${title}`,
    date ? `**Date:** ${date}` : null,
    attendees.length ? `**Attendees:** ${attendees.join(", ")}` : null,
    "\n## Summary",
    summaryLines.length ? summaryLines.map(l => `- ${l}`).join("\n") : "- Summary unavailable",
    "\n## Key Decisions",
    decisions.length ? decisions.map(l => `- ${l}`).join("\n") : "- None noted",
    "\n## Action Items",
    actions.length ? actions.map(l => `- ${l}`).join("\n") : "- None noted",
    "\n## Risks / Issues",
    risks.length ? risks.map(l => `- ${l}`).join("\n") : "- None noted",
    "\n## Notable Quotes",
    quotes.length ? quotes.map(l => `> ${l}`).join("\n") : "-"
  ].filter(Boolean).join("\n");
  return md;
}

async function summarizeWithOpenAI({ transcript, title, date, attendees = [] }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt = `Create a polished meeting summary in markdown with sections: Summary, Key Decisions, Action Items (with owners if possible), Risks/Issues, Notable Quotes.\n\nTitle: ${title}\nDate: ${date || ""}\nAttendees: ${attendees.join(", ")}\n\nTranscript:\n${transcript}`;
  const resp = await client.responses.create({
    model,
    input: prompt,
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 260)
  });
  const output = resp.output_text?.trim() || "";
  if (!output) return summarizeDeterministic({ transcript, title, date, attendees });
  return `# ${title}\n${date ? `\n**Date:** ${date}` : ""}${attendees.length ? `\n**Attendees:** ${attendees.join(", ")}` : ""}\n\n${output}`;
}

export async function summarizeMeeting({ transcript, title, date, attendees = [], tags = [], store = { googleDocs: true, localMarkdown: true } }, context = {}) {
  if (!transcript || typeof transcript !== "string") {
    const err = new Error("transcript_required");
    err.status = 400;
    throw err;
  }
  const userId = context.userId || "local";
  const safeTitle = typeof title === "string" && title.trim() ? title.trim() : "Meeting Summary";
  const summaryMarkdown = process.env.OPENAI_API_KEY
    ? await summarizeWithOpenAI({ transcript, title: safeTitle, date, attendees })
    : summarizeDeterministic({ transcript, title: safeTitle, date, attendees });

  let doc = null;
  if (store?.googleDocs) {
    try {
      const folderId = await ensureDriveFolderPath(["Aika", "Meetings"], userId);
      doc = await createGoogleDocInFolder(safeTitle, summaryMarkdown, folderId, userId);
    } catch {
      doc = null;
    }
  }

  const record = createMeetingRecord({
    title: safeTitle,
    date: date || null,
    attendees,
    tags,
    summaryMarkdown,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    userId
  });

  return {
    id: record.id,
    markdownPath: record.cachePath,
    googleDocId: doc?.documentId || null,
    googleDocUrl: doc?.documentId ? `https://docs.google.com/document/d/${doc.documentId}` : null,
    summaryMarkdown
  };
}
