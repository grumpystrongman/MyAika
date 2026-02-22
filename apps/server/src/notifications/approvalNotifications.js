import { sendTelegramMessage } from "../../integrations/messaging.js";
import { getRuntimeFlags, setRuntimeFlag } from "../../storage/runtime_flags.js";

function parseList(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function getApprovalChatIds() {
  const direct = parseList(process.env.APPROVALS_TELEGRAM_CHAT_IDS || "");
  if (direct.length) return direct;
  const taskIds = parseList(process.env.ASSISTANT_TASK_TELEGRAM_CHAT_ID || "");
  if (taskIds.length) return taskIds;
  return parseList(process.env.TELEGRAM_CHAT_ID || "");
}

function formatApprovalMessage(approval = {}) {
  const summary = approval.humanSummary || approval.summary || approval.preview || "Approval required";
  const tool = approval.toolName || approval.actionType || "";
  const id = approval.id || "";
  const lines = [
    "Approval required",
    summary,
    tool ? `Tool: ${tool}` : "",
    id ? `ID: ${id}` : "",
    "Reply /approve <id> to execute or /deny <id> to deny.",
    "Tip: /approvals lists pending approvals."
  ].filter(Boolean);
  return lines.join("\n");
}

function rememberLastApproval(chatId, approvalId) {
  if (!chatId || !approvalId) return;
  const flags = getRuntimeFlags();
  const map = { ...(flags.approval_last_by_chat || {}) };
  map[`telegram:${chatId}`] = approvalId;
  setRuntimeFlag("approval_last_by_chat", map);
}

export async function notifyApprovalCreated(approval = {}) {
  const chatIds = getApprovalChatIds();
  if (!chatIds.length) return { ok: false, reason: "no_chat_ids" };
  const message = formatApprovalMessage(approval);
  let sent = 0;
  for (const chatId of chatIds) {
    try {
      await sendTelegramMessage(chatId, message);
      rememberLastApproval(chatId, approval.id);
      sent += 1;
    } catch (err) {
      // ignore notification failures
      console.warn("approval telegram notify failed", err?.message || err);
    }
  }
  return { ok: sent > 0, sent };
}
