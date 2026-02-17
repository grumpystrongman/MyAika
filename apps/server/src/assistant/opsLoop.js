import { findAssistantTaskByTitle, createAssistantTask } from "../../storage/assistant_tasks.js";

let opsInterval = null;

const OPS_ENABLED = String(process.env.ASSISTANT_OPS_TASKS_ENABLED || "0") === "1";
const OPS_OWNER = String(process.env.ASSISTANT_OPS_OWNER || "local");
const OPS_BOOTSTRAP_INTERVAL_MINUTES = Number(process.env.ASSISTANT_OPS_BOOTSTRAP_INTERVAL_MINUTES || 360);
const CODE_REVIEW_ENABLED = String(process.env.ASSISTANT_OPS_CODE_REVIEW_ENABLED || "1") !== "0";
const PROPOSAL_SUMMARY_ENABLED = String(process.env.ASSISTANT_OPS_PROPOSAL_SUMMARY_ENABLED || "1") !== "0";

const CODE_REVIEW_TITLE = "Aika Ops: Weekly Code Review";
const PROPOSAL_TITLE = "Aika Ops: Proposal Summary";

function resolveSchedule({ intervalEnv, timeEnv, timezoneEnv, defaultInterval = 0, defaultTime = "" } = {}) {
  const interval = Number(process.env[intervalEnv] || defaultInterval);
  if (Number.isFinite(interval) && interval > 0) {
    return { type: "interval", intervalMinutes: Math.floor(interval) };
  }
  const timeOfDay = String(process.env[timeEnv] || defaultTime).trim();
  if (timeOfDay) {
    return {
      type: "daily",
      timeOfDay,
      timezone: String(process.env[timezoneEnv] || "").trim()
    };
  }
  return null;
}

function buildCodeReviewPrompt() {
  return [
    "Run a weekly code review and ops checklist for Aika.",
    "Focus on safety regressions, failed tasks, and pending change proposals.",
    "",
    "Pending change proposals:",
    "{{assistant_proposals:pending}}",
    "",
    "Recent task failures:",
    "{{assistant_ops:task_failures}}",
    "",
    "Recent audit activity:",
    "{{assistant_ops:audit_recent}}",
    "",
    "Output:",
    "- Key risks",
    "- What should be fixed next",
    "- Any approvals needed"
  ].join("\n");
}

function buildProposalSummaryPrompt() {
  return [
    "Summarize pending change proposals and recommend next actions.",
    "",
    "{{assistant_proposals:pending}}",
    "",
    "Output:",
    "- Summary of each proposal",
    "- Recommend approve / reject / needs info",
    "- Any blocking questions"
  ].join("\n");
}

function ensureTask({ title, prompt, schedule }) {
  const existing = findAssistantTaskByTitle(OPS_OWNER, title);
  if (existing) return existing;
  return createAssistantTask(OPS_OWNER, {
    title,
    prompt,
    schedule,
    notificationChannels: ["in_app", "email", "telegram"]
  });
}

export function ensureAssistantOpsTasks() {
  if (!OPS_ENABLED) return;
  if (CODE_REVIEW_ENABLED) {
    const schedule = resolveSchedule({
      intervalEnv: "ASSISTANT_OPS_CODE_REVIEW_INTERVAL_MINUTES",
      timeEnv: "ASSISTANT_OPS_CODE_REVIEW_TIME_OF_DAY",
      timezoneEnv: "ASSISTANT_OPS_CODE_REVIEW_TIMEZONE",
      defaultInterval: 10080
    });
    ensureTask({ title: CODE_REVIEW_TITLE, prompt: buildCodeReviewPrompt(), schedule });
  }
  if (PROPOSAL_SUMMARY_ENABLED) {
    const schedule = resolveSchedule({
      intervalEnv: "ASSISTANT_OPS_PROPOSAL_SUMMARY_INTERVAL_MINUTES",
      timeEnv: "ASSISTANT_OPS_PROPOSAL_SUMMARY_TIME_OF_DAY",
      timezoneEnv: "ASSISTANT_OPS_PROPOSAL_SUMMARY_TIMEZONE",
      defaultTime: "09:00"
    });
    ensureTask({ title: PROPOSAL_TITLE, prompt: buildProposalSummaryPrompt(), schedule });
  }
}

export function startAssistantOpsLoop() {
  if (opsInterval) return;
  if (!OPS_ENABLED) return;
  ensureAssistantOpsTasks();
  if (!Number.isFinite(OPS_BOOTSTRAP_INTERVAL_MINUTES) || OPS_BOOTSTRAP_INTERVAL_MINUTES <= 0) return;
  opsInterval = setInterval(() => {
    ensureAssistantOpsTasks();
  }, Math.max(60_000, OPS_BOOTSTRAP_INTERVAL_MINUTES * 60_000));
}
