import { listGmailPreview } from "./gmail.js";
import { listOutlookPreview } from "./outlook.js";

function toDate(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export async function getEmailInbox({ userId = "local", providers = ["gmail", "outlook"], limit = 30, lookbackDays } = {}) {
  const unique = Array.from(new Set((providers || []).map(p => String(p).toLowerCase()).filter(Boolean)));
  const perLimit = Math.max(5, Math.ceil(Number(limit || 30) / Math.max(unique.length, 1)));
  const results = [];

  for (const provider of unique) {
    if (provider === "gmail") {
      try {
        const items = await listGmailPreview({ userId, limit: perLimit, lookbackDays });
        results.push(...items);
      } catch {
        // ignore preview failures
      }
    }
    if (provider === "outlook") {
      try {
        const items = await listOutlookPreview({ userId, limit: perLimit, lookbackDays });
        results.push(...items);
      } catch {
        // ignore preview failures
      }
    }
  }

  const sorted = results.sort((a, b) => toDate(b.receivedAt) - toDate(a.receivedAt));
  return sorted.slice(0, Number(limit || 30));
}
