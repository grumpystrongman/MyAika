import crypto from "node:crypto";
import { getDb } from "../../storage/db.js";
import { nowIso } from "../../storage/utils.js";

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function monthRange(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function recordUsage({ model, promptTokens = 0, completionTokens = 0, totalTokens = 0, costUsd = 0 } = {}) {
  let db;
  try {
    db = getDb();
  } catch {
    return { skipped: true };
  }
  const id = makeId();
  db.prepare(
    `INSERT INTO openai_usage (id, ts, model, prompt_tokens, completion_tokens, total_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    nowIso(),
    String(model || ""),
    Math.max(0, Number(promptTokens) || 0),
    Math.max(0, Number(completionTokens) || 0),
    Math.max(0, Number(totalTokens) || 0),
    Math.max(0, Number(costUsd) || 0)
  );
  return { id };
}

export async function getMonthlyUsage(date = new Date()) {
  let db;
  try {
    db = getDb();
  } catch {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalCost: 0 };
  }
  const { start, end } = monthRange(date);
  const row = db.prepare(
    "SELECT SUM(prompt_tokens) AS promptTokens, SUM(completion_tokens) AS completionTokens, SUM(total_tokens) AS totalTokens, SUM(cost_usd) AS totalCost FROM openai_usage WHERE ts >= ? AND ts < ?"
  ).get(start, end);
  return {
    promptTokens: Number(row?.promptTokens || 0),
    completionTokens: Number(row?.completionTokens || 0),
    totalTokens: Number(row?.totalTokens || 0),
    totalCost: Number(row?.totalCost || 0)
  };
}
