import OpenAI from "openai";

let openaiClient = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

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

export async function planAction({ instruction, startUrl } = {}) {
  const cleanInstruction = String(instruction || "").trim();
  if (!cleanInstruction) {
    throw new Error("instruction_required");
  }

  const client = getClient();
  if (!client) {
    return {
      plan: {
        taskName: cleanInstruction.slice(0, 80) || "Action Plan",
        startUrl: startUrl || "",
        actions: startUrl ? [{ type: "goto", url: startUrl }] : [],
        safety: { requireApprovalFor: ["purchase", "send", "delete", "auth", "download", "upload"], maxActions: 60 }
      },
      explanation: "OPENAI_API_KEY is not configured; returning a minimal plan."
    };
  }

  const system = `You are an action planner that converts instructions into a JSON plan for a browser agent.\n\nOutput ONLY valid JSON with this shape:\n{\n  "taskName": "string",\n  "startUrl": "string optional",\n  "actions": [\n    {"type":"goto","url":"..."},\n    {"type":"click","selector":"..."},\n    {"type":"type","selector":"...","text":"..."},\n    {"type":"press","key":"Enter"},\n    {"type":"waitFor","selector":"...","timeoutMs":15000},\n    {"type":"extractText","selector":"..."},\n    {"type":"screenshot","name":"..."}\n  ],\n  "safety": {\n    "requireApprovalFor": ["purchase","send","delete","auth","download","upload"],\n    "maxActions": 60\n  }\n}\n\nSafety rules:\n- Never include steps that submit purchases or send messages automatically.\n- Never change account security settings.\n- Any authentication/log-in steps should be explicit and minimal.\n- Keep actions concise and under 60 steps.\n`;

  const user = `Instruction: ${cleanInstruction}\nStart URL (if any): ${startUrl || ""}`;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] }
    ],
    max_output_tokens: 500
  });

  const rawText = response?.output_text || "";
  const plan = extractJson(rawText);
  if (!plan) {
    return {
      plan: {
        taskName: cleanInstruction.slice(0, 80) || "Action Plan",
        startUrl: startUrl || "",
        actions: startUrl ? [{ type: "goto", url: startUrl }] : [],
        safety: { requireApprovalFor: ["purchase", "send", "delete", "auth", "download", "upload"], maxActions: 60 }
      },
      explanation: "Planner returned non-JSON output; returning a minimal plan."
    };
  }

  return {
    plan: {
      taskName: plan.taskName || cleanInstruction.slice(0, 80) || "Action Plan",
      startUrl: plan.startUrl || startUrl || "",
      actions: Array.isArray(plan.actions) ? plan.actions : [],
      safety: plan.safety || { requireApprovalFor: ["purchase", "send", "delete", "auth", "download", "upload"], maxActions: 60 }
    },
    explanation: "Plan generated from instruction."
  };
}
