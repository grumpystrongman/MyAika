import { syncNotion, isNotionConfigured } from "./notion.js";
import { syncSlack, isSlackConfigured } from "./slack.js";
import { syncOutlook, isOutlookConfigured } from "./outlook.js";
import { syncGmail, isGmailConfigured } from "./gmail.js";
import { syncJira, isJiraConfigured } from "./jira.js";
import { syncConfluence, isConfluenceConfigured } from "./confluence.js";

let notionRunning = false;
let slackRunning = false;
let outlookRunning = false;
let gmailRunning = false;
let jiraRunning = false;
let confluenceRunning = false;

function scheduleLoop({ name, intervalMinutes, runOnStartup, runner, isConfigured }) {
  const minutes = Number(intervalMinutes || 0);
  const shouldRun = typeof isConfigured === "function" ? isConfigured() : true;
  if (!shouldRun) return null;
  if (!minutes || minutes <= 0) {
    if (runOnStartup) runner().catch(() => {});
    return null;
  }
  const intervalMs = minutes * 60_000;
  const timer = setInterval(() => {
    runner().catch(() => {});
  }, Math.max(60_000, intervalMs));
  if (runOnStartup) {
    runner().catch(() => {});
  }
  return timer;
}

export async function syncNotionConnector(opts = {}) {
  if (notionRunning) return { ok: false, error: "sync_in_progress" };
  notionRunning = true;
  try {
    return await syncNotion(opts);
  } finally {
    notionRunning = false;
  }
}

export async function syncSlackConnector(opts = {}) {
  if (slackRunning) return { ok: false, error: "sync_in_progress" };
  slackRunning = true;
  try {
    return await syncSlack(opts);
  } finally {
    slackRunning = false;
  }
}

export async function syncOutlookConnector(opts = {}) {
  if (outlookRunning) return { ok: false, error: "sync_in_progress" };
  outlookRunning = true;
  try {
    return await syncOutlook(opts);
  } finally {
    outlookRunning = false;
  }
}

export async function syncGmailConnector(opts = {}) {
  if (gmailRunning) return { ok: false, error: "sync_in_progress" };
  gmailRunning = true;
  try {
    return await syncGmail(opts);
  } finally {
    gmailRunning = false;
  }
}

export async function syncJiraConnector(opts = {}) {
  if (jiraRunning) return { ok: false, error: "sync_in_progress" };
  jiraRunning = true;
  try {
    return await syncJira(opts);
  } finally {
    jiraRunning = false;
  }
}

export async function syncConfluenceConnector(opts = {}) {
  if (confluenceRunning) return { ok: false, error: "sync_in_progress" };
  confluenceRunning = true;
  try {
    return await syncConfluence(opts);
  } finally {
    confluenceRunning = false;
  }
}

let notionTimer = null;
let slackTimer = null;
let outlookTimer = null;
let gmailTimer = null;
let jiraTimer = null;
let confluenceTimer = null;

export function startNotionSyncLoop() {
  if (notionTimer) return;
  notionTimer = scheduleLoop({
    name: "notion",
    intervalMinutes: process.env.NOTION_SYNC_INTERVAL_MINUTES,
    runOnStartup: String(process.env.NOTION_SYNC_ON_STARTUP || "0") === "1",
    runner: () => syncNotionConnector(),
    isConfigured: () => isNotionConfigured()
  });
}

export function startSlackSyncLoop() {
  if (slackTimer) return;
  slackTimer = scheduleLoop({
    name: "slack",
    intervalMinutes: process.env.SLACK_SYNC_INTERVAL_MINUTES,
    runOnStartup: String(process.env.SLACK_SYNC_ON_STARTUP || "0") === "1",
    runner: () => syncSlackConnector(),
    isConfigured: () => isSlackConfigured()
  });
}

export function startOutlookSyncLoop() {
  if (outlookTimer) return;
  outlookTimer = scheduleLoop({
    name: "outlook",
    intervalMinutes: process.env.OUTLOOK_SYNC_INTERVAL_MINUTES,
    runOnStartup: String(process.env.OUTLOOK_SYNC_ON_STARTUP || "0") === "1",
    runner: () => syncOutlookConnector(),
    isConfigured: () => isOutlookConfigured()
  });
}

export function startGmailSyncLoop() {
  if (gmailTimer) return;
  gmailTimer = scheduleLoop({
    name: "gmail",
    intervalMinutes: process.env.GMAIL_SYNC_INTERVAL_MINUTES,
    runOnStartup: String(process.env.GMAIL_SYNC_ON_STARTUP || "0") === "1",
    runner: () => syncGmailConnector(),
    isConfigured: () => isGmailConfigured()
  });
}

export function startJiraSyncLoop() {
  if (jiraTimer) return;
  jiraTimer = scheduleLoop({
    name: "jira",
    intervalMinutes: process.env.JIRA_SYNC_INTERVAL_MINUTES,
    runOnStartup: String(process.env.JIRA_SYNC_ON_STARTUP || "0") === "1",
    runner: () => syncJiraConnector(),
    isConfigured: () => isJiraConfigured()
  });
}

export function startConfluenceSyncLoop() {
  if (confluenceTimer) return;
  confluenceTimer = scheduleLoop({
    name: "confluence",
    intervalMinutes: process.env.CONFLUENCE_SYNC_INTERVAL_MINUTES,
    runOnStartup: String(process.env.CONFLUENCE_SYNC_ON_STARTUP || "0") === "1",
    runner: () => syncConfluenceConnector(),
    isConfigured: () => isConfluenceConfigured()
  });
}
