import { ToolRegistry } from "./registry.js";
import { ToolExecutor } from "./executor.js";
import { createNote, searchNotesTool } from "./tools/notes.js";
import { createTodo, listTodos } from "./tools/todos.js";
import { summarizeMeeting } from "./tools/meeting.js";
import { proposeHold } from "./tools/calendar.js";
import { draftReply, sendEmail } from "./tools/email.js";
import { applyChanges } from "./tools/spreadsheet.js";
import { writeMemoryTool, searchMemoryTool, rotateKeyTool } from "./tools/memory.js";
import {
  plexIdentity,
  firefliesTranscripts,
  weatherCurrent,
  webSearch,
  slackPost,
  telegramSend,
  discordSend
} from "./tools/integrations.js";

const registry = new ToolRegistry();

registry.register(
  {
    name: "meeting.summarize",
    description: "Summarize a meeting transcript and store markdown + Google Doc.",
    paramsSchema: {
      transcript: "string",
      title: "string",
      date: "string",
      attendees: "string[]",
      tags: "string[]",
      store: "object"
    },
    riskLevel: "low"
  },
  summarizeMeeting
);

registry.register(
  {
    name: "notes.create",
    description: "Create a note and store in Google Docs + local cache.",
    paramsSchema: { title: "string", body: "string", tags: "string[]", store: "object" },
    riskLevel: "low"
  },
  createNote
);

registry.register(
  {
    name: "notes.search",
    description: "Search local notes index/cache.",
    paramsSchema: { query: "string", tags: "string[]", limit: "number" },
    riskLevel: "low"
  },
  searchNotesTool
);

registry.register(
  {
    name: "todos.create",
    description: "Create a todo item.",
    paramsSchema: { title: "string", details: "string", due: "string", priority: "string", tags: "string[]" },
    riskLevel: "low"
  },
  createTodo
);

registry.register(
  {
    name: "todos.list",
    description: "List todos with filters.",
    paramsSchema: { status: "string", dueWithinDays: "number", tag: "string" },
    riskLevel: "low"
  },
  listTodos
);

registry.register(
  {
    name: "calendar.proposeHold",
    description: "Create a draft calendar hold locally.",
    paramsSchema: { title: "string", start: "string", end: "string", timezone: "string", attendees: "string[]", location: "string", description: "string" },
    riskLevel: "medium"
  },
  proposeHold
);

registry.register(
  {
    name: "email.draftReply",
    description: "Create a draft email reply locally.",
    paramsSchema: { originalEmail: "object", tone: "string", context: "string", signOffName: "string" },
    riskLevel: "medium"
  },
  draftReply
);

registry.register(
  {
    name: "email.send",
    description: "Send a drafted email (approval required).",
    paramsSchema: { draftId: "string", sendTo: "string[]", cc: "string[]", bcc: "string[]" },
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
    description: "Create a draft spreadsheet patch and Google Doc.",
    paramsSchema: { target: "object", changes: "object[]", draftOnly: "boolean" },
    riskLevel: "medium"
  },
  applyChanges
);

registry.register(
  {
    name: "memory.write",
    description: "Write to the memory vault (tiered).",
    paramsSchema: { tier: "number", title: "string", content: "string", tags: "string[]", containsPHI: "boolean" },
    riskLevel: "medium"
  },
  writeMemoryTool
);

registry.register(
  {
    name: "memory.search",
    description: "Search memory vault by tier.",
    paramsSchema: { tier: "number", query: "string", tags: "string[]", limit: "number" },
    riskLevel: "medium"
  },
  searchMemoryTool
);

registry.register(
  {
    name: "memory.rotateKey",
    description: "Rotate PHI encryption key (placeholder).",
    paramsSchema: { confirm: "boolean" },
    requiresApproval: true,
    riskLevel: "high"
  },
  rotateKeyTool
);

registry.register(
  {
    name: "integrations.plexIdentity",
    description: "Fetch Plex identity (local stub or real).",
    paramsSchema: { mode: "string", token: "string" },
    riskLevel: "low"
  },
  plexIdentity
);

registry.register(
  {
    name: "integrations.firefliesTranscripts",
    description: "Fetch Fireflies transcripts list.",
    paramsSchema: { mode: "string", limit: "number" },
    riskLevel: "medium"
  },
  firefliesTranscripts
);

registry.register(
  {
    name: "weather.current",
    description: "Get current weather for a location.",
    paramsSchema: { location: "string" },
    riskLevel: "low"
  },
  weatherCurrent
);

registry.register(
  {
    name: "web.search",
    description: "Search the web and return top results.",
    paramsSchema: { query: "string", limit: "number" },
    riskLevel: "low"
  },
  webSearch
);

registry.register(
  {
    name: "messaging.slackPost",
    description: "Send a Slack message (approval required).",
    paramsSchema: { channel: "string", message: "string" },
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
    paramsSchema: { chatId: "string", message: "string" },
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
    paramsSchema: { channelId: "string", message: "string" },
    requiresApproval: true,
    outbound: true,
    riskLevel: "high",
    outboundTargets: () => ["https://discord.com"]
  },
  discordSend
);

const executor = new ToolExecutor(registry);

export { registry, executor };
