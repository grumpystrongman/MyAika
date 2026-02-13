import { assessActionPlan, runActionPlan, startActionRun } from "../../src/actionRunner/runner.js";

export async function actionRun(params = {}, context = {}) {
  const assessment = assessActionPlan({
    taskName: params.taskName,
    startUrl: params.startUrl,
    actions: params.actions,
    safety: params.safety,
    workspaceId: context.workspaceId || "default"
  });

  if (assessment.totalActions > assessment.maxActions) {
    const err = new Error("action_runner_max_actions_exceeded");
    err.status = 400;
    throw err;
  }

  if (params.async) {
    return startActionRun(params, context);
  }

  return await runActionPlan(params, context);
}
