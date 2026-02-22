import { getRuntimeFlags, setRuntimeFlag } from "../../storage/runtime_flags.js";
import { getSettings } from "../../storage/settings.js";

function todayKey(userId = "local") {
  const date = new Date().toISOString().slice(0, 10);
  return `aika_noise_${userId}_${date}`;
}

export function getNoiseBudgetStatus(userId = "local") {
  const settings = getSettings(userId);
  const limit = Number(settings.noiseBudgetPerDay || 0) || 0;
  const flags = getRuntimeFlags();
  const used = Number(flags[todayKey(userId)] || 0) || 0;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export function consumeNoiseBudget(userId = "local", cost = 1) {
  const status = getNoiseBudgetStatus(userId);
  if (status.remaining < cost) return { allowed: false, ...status };
  const nextUsed = status.used + cost;
  setRuntimeFlag(todayKey(userId), nextUsed);
  return { allowed: true, limit: status.limit, used: nextUsed, remaining: Math.max(0, status.limit - nextUsed) };
}
