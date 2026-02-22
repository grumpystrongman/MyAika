import { createAssistantTask, findAssistantTaskByTitle, updateAssistantTask } from "../../storage/assistant_tasks.js";
import { getDigestSchedule } from "./digestEngine.js";

const DAILY_DIGEST_TITLE = "Aika Digest: Daily";
const MIDDAY_PULSE_TITLE = "Aika Digest: Midday Pulse";
const WEEKLY_REVIEW_TITLE = "Aika Digest: Weekly Review";

function ensureTask({ title, prompt, schedule, ownerId = "local" }) {
  const existing = findAssistantTaskByTitle(ownerId, title);
  if (!existing) {
    return createAssistantTask(ownerId, {
      title,
      prompt,
      schedule,
      notificationChannels: ["in_app", "email", "telegram"]
    });
  }
  const scheduleChanged = JSON.stringify(existing.schedule || {}) !== JSON.stringify(schedule || {});
  const promptChanged = existing.prompt !== prompt;
  if (scheduleChanged || promptChanged) {
    return updateAssistantTask(ownerId, existing.id, {
      prompt: promptChanged ? prompt : undefined,
      schedule: scheduleChanged ? schedule : undefined
    });
  }
  return existing;
}

export function ensureDigestTasks({ ownerId = "local" } = {}) {
  const schedule = getDigestSchedule(ownerId);
  ensureTask({
    ownerId,
    title: DAILY_DIGEST_TITLE,
    prompt: "{{aika_digest:daily}}",
    schedule: { type: "daily", timeOfDay: schedule.daily, timezone: "" }
  });
  ensureTask({
    ownerId,
    title: MIDDAY_PULSE_TITLE,
    prompt: "{{aika_digest:pulse}}",
    schedule: { type: "daily", timeOfDay: schedule.pulse, timezone: "" }
  });
  ensureTask({
    ownerId,
    title: WEEKLY_REVIEW_TITLE,
    prompt: "{{aika_digest:weekly}}",
    schedule: { type: "weekly", dayOfWeek: schedule.weeklyDay, timeOfDay: schedule.weekly, timezone: "" }
  });
}
