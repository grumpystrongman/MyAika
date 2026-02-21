import { routeModel } from "./modelRouter.js";
import { responsesCreate } from "../llm/openaiClient.js";

function extractJson(text) {
  if (!text) return null;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const chunk = text.slice(first, last + 1);
  try {
    return JSON.parse(chunk);
  } catch {
    return null;
  }
}

function browserFallbackPlan(cleanInstruction, startUrl) {
  return {
    taskName: cleanInstruction.slice(0, 80) || "Action Plan",
    startUrl: startUrl || "",
    actions: startUrl ? [{ type: "goto", url: startUrl }] : [],
    safety: { requireApprovalFor: ["purchase", "send", "delete", "auth", "download", "upload"], maxActions: 60 }
  };
}

function desktopFallbackPlan(cleanInstruction) {
  return {
    taskName: cleanInstruction.slice(0, 80) || "Desktop Plan",
    actions: [],
    safety: {
      requireApprovalFor: ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"],
      maxActions: 40,
      approvalMode: "per_run"
    }
  };
}

function plannerSystemFor(mode) {
  if (mode === "desktop") {
    return [
      "You are a desktop action planner for Windows.",
      "Output ONLY valid JSON with this shape:",
      "{",
      "  \"taskName\": \"string\",",
      "  \"actions\": [",
      "    {\"type\":\"launch\",\"target\":\"notepad.exe\"},",
      "    {\"type\":\"wait\",\"ms\":800},",
      "    {\"type\":\"type\",\"text\":\"hello\"},",
      "    {\"type\":\"key\",\"combo\":\"CTRL+S\"},",
      "    {\"type\":\"mouseMove\",\"x\":200,\"y\":120},",
      "    {\"type\":\"mouseClick\",\"x\":200,\"y\":120,\"button\":\"left\",\"count\":1},",
      "    {\"type\":\"screenshot\",\"name\":\"step\"},",
      "    {\"type\":\"clipboardSet\",\"text\":\"...\"},",
      "    {\"type\":\"visionOcr\",\"name\":\"screen\",\"lang\":\"eng\"},",
      "    {\"type\":\"uiaClick\",\"name\":\"Save\",\"automationId\":\"FileSave\"},",
      "    {\"type\":\"uiaSetValue\",\"name\":\"Title\",\"automationId\":\"TitleInput\",\"value\":\"Hello\"}",
      "  ],",
      "  \"safety\": {",
      "    \"requireApprovalFor\": [\"launch\",\"input\",\"key\",\"mouse\",\"clipboard\",\"screenshot\",\"new_app\",\"vision\",\"uia\"],",
      "    \"maxActions\": 40,",
      "    \"approvalMode\": \"per_run\"",
      "  }",
      "}",
      "Safety rules:",
      "- Never include destructive steps (delete files, uninstall, format).",
      "- Never include password manager access or security setting changes.",
      "- Keep actions concise and under 40 steps.",
      "- Prefer explicit waits between launches and typing."
    ].join("\n");
  }

  return [
    "You are an action planner that converts instructions into a JSON plan for a browser agent.",
    "Output ONLY valid JSON with this shape:",
    "{",
    "  \"taskName\": \"string\",",
    "  \"startUrl\": \"string optional\",",
    "  \"actions\": [",
    "    {\"type\":\"goto\",\"url\":\"...\"},",
    "    {\"type\":\"click\",\"selector\":\"...\"},",
    "    {\"type\":\"type\",\"selector\":\"...\",\"text\":\"...\"},",
    "    {\"type\":\"press\",\"key\":\"Enter\"},",
    "    {\"type\":\"waitFor\",\"selector\":\"...\",\"timeoutMs\":15000},",
    "    {\"type\":\"extractText\",\"selector\":\"...\"},",
    "    {\"type\":\"screenshot\",\"name\":\"...\"}",
    "  ],",
    "  \"safety\": {",
    "    \"requireApprovalFor\": [\"purchase\",\"send\",\"delete\",\"auth\",\"download\",\"upload\"],",
    "    \"maxActions\": 60",
    "  }",
    "}",
    "Safety rules:",
    "- Never include steps that submit purchases or send messages automatically.",
    "- Never change account security settings.",
    "- Any authentication/log-in steps should be explicit and minimal.",
    "- Keep actions concise and under 60 steps."
  ].join("\n");
}

function criticSystemFor(mode) {
  if (mode === "desktop") {
    return [
      "You are a safety critic reviewing a desktop automation plan.",
      "Return ONLY JSON with this shape:",
      "{",
      "  \"approved\": true|false,",
      "  \"issues\": [\"...\"],",
      "  \"suggestedPlan\": { ... }",
      "}",
      "Guidelines:",
      "- Reject any plan with destructive steps, credential exfiltration, or security changes.",
      "- Ensure risky actions are explicit and have waits.",
      "- If changes are needed, include suggestedPlan."
    ].join("\n");
  }
  return [
    "You are a safety critic reviewing a browser automation plan.",
    "Return ONLY JSON with this shape:",
    "{",
    "  \"approved\": true|false,",
    "  \"issues\": [\"...\"],",
    "  \"suggestedPlan\": { ... }",
    "}",
    "Guidelines:",
    "- Reject plans that send messages, make purchases, or alter account security without explicit approval steps.",
    "- Ensure selectors are specific and waits are included.",
    "- If changes are needed, include suggestedPlan."
  ].join("\n");
}

async function callModel({ purpose, preferLocal, requireCloud, input }) {
  const route = routeModel({ purpose, preferLocal, requireCloud });
  if (!route.client) return { error: "model_unavailable", route };
  const response = await responsesCreate({ model: route.model, input });
  return { text: response?.output_text || "", route };
}

function normalizeBrowserPlan(plan, cleanInstruction, startUrl) {
  const fallback = browserFallbackPlan(cleanInstruction, startUrl);
  return {
    taskName: plan?.taskName || fallback.taskName,
    startUrl: plan?.startUrl || fallback.startUrl,
    actions: Array.isArray(plan?.actions) ? plan.actions : fallback.actions,
    safety: plan?.safety || fallback.safety
  };
}

function normalizeDesktopPlan(plan, cleanInstruction) {
  const fallback = desktopFallbackPlan(cleanInstruction);
  return {
    taskName: plan?.taskName || fallback.taskName,
    actions: Array.isArray(plan?.actions) ? plan.actions : fallback.actions,
    safety: plan?.safety || fallback.safety
  };
}

export async function planWithAgents({ instruction, startUrl, mode = "browser" } = {}) {
  const cleanInstruction = String(instruction || "").trim();
  if (!cleanInstruction) {
    throw new Error("instruction_required");
  }

  const plannerSystem = plannerSystemFor(mode);
  const plannerUser = mode === "desktop"
    ? `Instruction: ${cleanInstruction}`
    : `Instruction: ${cleanInstruction}\nStart URL (if any): ${startUrl || ""}`;

  const plannerInput = [
    { role: "system", content: [{ type: "input_text", text: plannerSystem }] },
    { role: "user", content: [{ type: "input_text", text: plannerUser }] }
  ];

  const plannerResult = await callModel({
    purpose: "planner",
    preferLocal: String(process.env.AGENT_PLANNER_PREFER_LOCAL || "0") === "1",
    requireCloud: false,
    input: plannerInput
  });

  const rawPlan = extractJson(plannerResult.text);
  const normalizedPlan = mode === "desktop"
    ? normalizeDesktopPlan(rawPlan, cleanInstruction)
    : normalizeBrowserPlan(rawPlan, cleanInstruction, startUrl);

  if (!rawPlan) {
    return {
      plan: normalizedPlan,
      explanation: "Planner returned non-JSON output; returning fallback plan."
    };
  }

  const criticSystem = criticSystemFor(mode);
  const criticUser = `Plan to review:\n${JSON.stringify(normalizedPlan, null, 2)}`;
  const criticInput = [
    { role: "system", content: [{ type: "input_text", text: criticSystem }] },
    { role: "user", content: [{ type: "input_text", text: criticUser }] }
  ];

  let critique = null;
  try {
    const criticResult = await callModel({
      purpose: "critic",
      preferLocal: String(process.env.AGENT_CRITIC_PREFER_LOCAL || "0") === "1",
      requireCloud: String(process.env.AGENT_CRITIC_FORCE_CLOUD || "0") === "1",
      input: criticInput
    });
    critique = extractJson(criticResult.text);
  } catch {
    critique = null;
  }

  if (critique && critique.approved === false) {
    const suggested = critique.suggestedPlan;
    const safePlan = mode === "desktop"
      ? normalizeDesktopPlan(suggested, cleanInstruction)
      : normalizeBrowserPlan(suggested, cleanInstruction, startUrl);
    return {
      plan: safePlan,
      explanation: `Plan revised by critic. Issues: ${(critique.issues || []).join("; ")}`.trim()
    };
  }

  return {
    plan: normalizedPlan,
    explanation: critique?.issues?.length
      ? `Plan reviewed. Notes: ${critique.issues.join("; ")}`
      : "Plan generated with multi-agent review."
  };
}
