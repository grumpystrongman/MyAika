export function getRecordingAudioUrl(recordingId, recording) {
  if (recording?.storage_url) return recording.storage_url;
  return `/api/recordings/${recordingId}/audio`;
}

function formatStamp(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function buildTranscriptText(recording) {
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

export function buildMeetingNotesMarkdown(recording) {
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

export function resolvePublicBaseUrl(baseUrl = "") {
  const trimmed = String(baseUrl || "").trim();
  if (trimmed) return trimmed.replace(/\/+$/, "");
  const envBase = String(process.env.PUBLIC_SERVER_URL || process.env.PUBLIC_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const port = process.env.PORT || 8790;
  return `http://127.0.0.1:${port}`;
}

export function buildAbsoluteUrl(maybeUrl, baseUrl = "") {
  if (!maybeUrl) return "";
  const url = String(maybeUrl);
  if (/^https?:\/\//i.test(url)) return url;
  const base = resolvePublicBaseUrl(baseUrl);
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function buildMeetingEmailText({ recording, notesUrl, transcriptUrl, audioUrl, googleDocUrl }) {
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
