import crypto from "node:crypto";
import { getDb } from "../../storage/db.js";
import { redactPayload, redactJsonString } from "./redact.js";

function nowIso() {
  return new Date().toISOString();
}

function canonicalize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

function computeHash(prevHash, event) {
  const payload = JSON.stringify(canonicalize(event));
  const input = `${prevHash || ""}${payload}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getLastHash(db) {
  const row = db.prepare("SELECT hash FROM audit_events ORDER BY ts DESC LIMIT 1").get();
  return row?.hash || "";
}

export function appendAuditEvent(event = {}) {
  const db = getDb();
  const id = crypto.randomBytes(8).toString("hex");
  const ts = event.ts || nowIso();
  const prevHash = getLastHash(db);
  const eventWithoutHash = {
    id,
    ts,
    user: event.user || "",
    session: event.session || "",
    action_type: event.action_type || "",
    decision: event.decision || "",
    reason: event.reason || "",
    risk_score: Number.isFinite(event.risk_score) ? event.risk_score : null,
    resource_refs: JSON.stringify(redactPayload(event.resource_refs || [])),
    redacted_payload: redactJsonString(event.redacted_payload || {}),
    result_redacted: redactJsonString(event.result_redacted || {}),
    prev_hash: prevHash || ""
  };
  const hash = computeHash(prevHash || "", eventWithoutHash);
  db.prepare(
    `INSERT INTO audit_events (id, ts, user, session, action_type, decision, reason, risk_score, resource_refs, redacted_payload, result_redacted, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventWithoutHash.id,
    eventWithoutHash.ts,
    eventWithoutHash.user,
    eventWithoutHash.session,
    eventWithoutHash.action_type,
    eventWithoutHash.decision,
    eventWithoutHash.reason,
    eventWithoutHash.risk_score,
    eventWithoutHash.resource_refs,
    eventWithoutHash.redacted_payload,
    eventWithoutHash.result_redacted,
    eventWithoutHash.prev_hash,
    hash
  );
  return { ...eventWithoutHash, hash };
}

export function listAuditEvents({ limit = 100 } = {}) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM audit_events ORDER BY ts DESC LIMIT ?").all(Number(limit || 100));
  return rows.map(row => ({
    ...row,
    resource_refs: safeParse(row.resource_refs, []),
    redacted_payload: safeParse(row.redacted_payload, {}),
    result_redacted: safeParse(row.result_redacted, {})
  }));
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function verifyAuditChain({ limit = 5000 } = {}) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM audit_events ORDER BY ts ASC LIMIT ?").all(Number(limit || 5000));
  let prevHash = "";
  for (const row of rows) {
    const eventWithoutHash = {
      id: row.id,
      ts: row.ts,
      user: row.user,
      session: row.session,
      action_type: row.action_type,
      decision: row.decision,
      reason: row.reason,
      risk_score: row.risk_score,
      resource_refs: row.resource_refs,
      redacted_payload: row.redacted_payload,
      result_redacted: row.result_redacted,
      prev_hash: row.prev_hash || ""
    };
    const computed = computeHash(prevHash, eventWithoutHash);
    if (computed !== row.hash) {
      return { ok: false, failedAt: row.id, expected: computed, actual: row.hash };
    }
    prevHash = row.hash;
  }
  return { ok: true, count: rows.length, lastHash: prevHash };
}
