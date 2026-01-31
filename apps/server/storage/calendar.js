import crypto from "node:crypto";
import { getDb } from "./db.js";
import { nowIso } from "./utils.js";

export function createHoldRecord({ title, start, end, timezone, attendees = [], location = "", description = "" }) {
  const db = getDb();
  const id = crypto.randomBytes(8).toString("hex");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO calendar_holds (id, title, start, end, timezone, attendees_json, location, description, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    title,
    start,
    end,
    timezone,
    JSON.stringify(attendees),
    location,
    description,
    "draft",
    createdAt
  );
  return { id, title, start, end, timezone, attendees, location, description, status: "draft", createdAt };
}
