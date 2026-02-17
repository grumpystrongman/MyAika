import { runSignalsIngestion } from "./pipeline.js";

let intervalId = null;
let lastRunDay = "";

function parseTime(value) {
  const raw = String(value || "06:15").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 6, minute: 15 };
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

function getTimeParts(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    const parts = formatter.formatToParts(date).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute)
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes()
    };
  }
}

function dayKeyFromParts(parts) {
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${parts.year}-${m}-${d}`;
}

async function checkAndRun() {
  const timeZone = process.env.SIGNALS_TIMEZONE || "America/New_York";
  const target = parseTime(process.env.SIGNALS_INGEST_TIME || "06:15");
  const now = new Date();
  const parts = getTimeParts(now, timeZone);
  const dayKey = dayKeyFromParts(parts);
  if (parts.hour === target.hour && parts.minute === target.minute) {
    if (lastRunDay === dayKey) return;
    lastRunDay = dayKey;
    runSignalsIngestion().catch(err => {
      console.warn("signals ingestion failed", err?.message || err);
    });
  }
}

export function startSignalsScheduler() {
  if (intervalId) return;
  const onStartup = String(process.env.SIGNALS_INGEST_ON_STARTUP || "0") === "1";
  if (onStartup) {
    runSignalsIngestion().catch(err => {
      console.warn("signals ingestion failed", err?.message || err);
    });
  }
  intervalId = setInterval(() => {
    checkAndRun().catch(() => {});
  }, 60000);
}

export function stopSignalsScheduler() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

