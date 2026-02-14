import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

export function createScenarioRun({ assetClass, windowDays, picks, results, notes } = {}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const runAt = nowIso();
  db.prepare(
    `INSERT INTO trading_scenarios (id, run_at, asset_class, window_days, picks_json, results_json, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    runAt,
    assetClass || "all",
    Number(windowDays || 30),
    JSON.stringify(picks || []),
    JSON.stringify(results || []),
    notes || ""
  );
  return { id, runAt };
}

export function listScenarioRuns({ limit = 10 } = {}) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM trading_scenarios ORDER BY run_at DESC LIMIT ?`
  ).all(Number(limit || 10));
  return rows.map(row => ({
    id: row.id,
    run_at: row.run_at,
    asset_class: row.asset_class,
    window_days: row.window_days,
    picks: safeJsonParse(row.picks_json, []),
    results: safeJsonParse(row.results_json, []),
    notes: row.notes || ""
  }));
}
