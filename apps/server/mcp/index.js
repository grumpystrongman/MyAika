import { ToolRegistry } from "./registry.js";
import { ToolExecutor } from "./executor.js";
import { createNote, searchNotes } from "./tools/notes.js";
import { createTodo, listTodos } from "./tools/todos.js";
import { summarizeMeeting } from "./tools/meeting.js";
import { proposeHold } from "./tools/calendar.js";
import { draftReply, sendEmail } from "./tools/email.js";
import { applyChanges } from "./tools/spreadsheet.js";
import { writeMemoryTool, searchMemoryTool, rotateKeyTool } from "./tools/memory.js";
import {
  plexIdentity,
  firefliesTranscripts,
  slackPost,
  telegramSend,
  discordSend
} from "./tools/integrations.js";

const registry = new ToolRegistry();

registry.register(
  {
    name: "meeting.summarize",
    description: "Summarize a meeting transcript and store a local markdown summary.",
    paramsSchema: { transcript: "string", title: "string" },
    riskLevel: "low"
  },
  summarizeMeeting
);

registry.register(
  {
    name: "notes.create",
    description: "Create a local note.",
    paramsSchema: { text: "string" },
    riskLevel: "low"
  },
  ({ text }) => createNote(text)
);

registry.register(
  {
    name: "notes.search",
    description: "Search local notes.",
    paramsSchema: { query: "string", limit: "number" },
    riskLevel: "low"
  },
  ({ query, limit }) => searchNotes(query, limit)
);

registry.register(
  {
    name: "todos.create",
    description: "Create a todo item.",
    paramsSchema: { text: "string" },
    riskLevel: "low"
  },
  ({ text }) => createTodo(text)
);

registry.register(
  {
    name: "todos.list",
    description: "List todos.",
    paramsSchema: {},
    riskLevel: "low"
  },
  () => listTodos()
);

registry.register(
  {
    name: "calendar.proposeHold",
    description: "Create a draft calendar hold locally.",
    paramsSchema: { title: "string", start: "string", end: "string", attendees: "string[]" },
    riskLevel: "medium"
  },
  proposeHold
);

registry.register(
  {
    name: "email.draftReply",
    description: "Create a draft email reply locally.",
    paramsSchema: { to: "string", subject: "string", body: "string" },
    riskLevel: "medium"
  },
  draftReply
);

registry.register(
  {
    name: "email.send",
    description: "Send a drafted email (approval required).",
    paramsSchema: { draftId: "string" },
    requiresApproval: true,
    outbound: true,
    riskLevel: "high",
    humanSummary: params => `Send email draft ${params?.draftId || ""}`
  },
  sendEmail
);

registry.register(
  {
    name: "spreadsheet.applyChanges",
    description: "Apply changes to a spreadsheet (draft-only).",
    paramsSchema: { filePath: "string", changes: "object" },
    requiresApproval: true,
    riskLevel: "high"
  },
  applyChanges
);

registry.register(
  {
    name: "memory.write",
    description: "Write to the memory vault (tiered).",
    paramsSchema: { tier: "memory_profile|memory_work|memory_phi", content: "string", metadata: "object" },
    riskLevel: "medium"
  },
  writeMemoryTool
);

registry.register(
  {
    name: "memory.search",
    description: "Search memory vault by tier.",
    paramsSchema: { tier: "memory_profile|memory_work|memory_phi", query: "string" },
    riskLevel: "medium"
  },
  searchMemoryTool
);

registry.register(
  {
    name: "memory.rotateKey",
    description: "Rotate PHI encryption key (placeholder).",
    paramsSchema: {},
    requiresApproval: true,
    riskLevel: "high"
  },
  rotateKeyTool
);

registry.register(
  {
    name: "integrations.plexIdentity",
    description: "Fetch Plex identity (local).",
    paramsSchema: {},
    riskLevel: "low"
  },
  plexIdentity
);

registry.register(
  {
    name: "integrations.firefliesTranscripts",
    description: "Fetch Fireflies transcripts list.",
    paramsSchema: { limit: "number" },
    riskLevel: "medium"
  },
  firefliesTranscripts
);

registry.register(
  {
    name: "messaging.slackPost",
    description: "Send a Slack message (approval required).",
    paramsSchema: { channel: "string", text: "string" },
    requiresApproval: true,
    outbound: true,
    riskLevel: "high",
    outboundTargets: () => ["https://slack.com"]
  },
  slackPost
);

registry.register(
  {
    name: "messaging.telegramSend",
    description: "Send a Telegram message (approval required).",
    paramsSchema: { chatId: "string", text: "string" },
    requiresApproval: true,
    outbound: true,
    riskLevel: "high",
    outboundTargets: () => ["https://api.telegram.org"]
  },
  telegramSend
);

registry.register(
  {
    name: "messaging.discordSend",
    description: "Send a Discord message (approval required).",
    paramsSchema: { text: "string" },
    requiresApproval: true,
    outbound: true,
    riskLevel: "high",
    outboundTargets: () => ["https://discord.com"]
  },
  discordSend
);

const executor = new ToolExecutor(registry);

export { registry, executor };
