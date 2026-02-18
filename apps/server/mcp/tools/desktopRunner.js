import { assessDesktopPlan, runDesktopPlan, startDesktopRun } from "../../src/desktopRunner/runner.js";

export async function desktopRun(params = {}, context = {}) {
  const assessment = assessDesktopPlan({
    taskName: params.taskName,
    actions: params.actions,
    safety: params.safety,
    workspaceId: context.workspaceId || "default"
  });

  if (assessment.totalActions > assessment.maxActions) {
    const err = new Error("desktop_runner_max_actions_exceeded");
    err.status = 400;
    throw err;
  }

  if (params.async) {
    return startDesktopRun(params, context);
  }

  return await runDesktopPlan(params, context);
}
