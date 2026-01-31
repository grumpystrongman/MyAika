import { createHoldRecord } from "../../storage/calendar.js";

export function proposeHold({ title, start, end, timezone, attendees = [], location = "", description = "" }) {
  if (!title || !start || !end || !timezone) {
    const err = new Error("title_start_end_timezone_required");
    err.status = 400;
    throw err;
  }
  return createHoldRecord({ title, start, end, timezone, attendees, location, description });
}