import OpenAI from "openai";
import { planWithAgents } from "../agent/multiAgent.js";

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

export async function planDesktopAction({ instruction } = {}) {
  const cleanInstruction = String(instruction || "").trim();
  if (!cleanInstruction) {
    throw new Error("instruction_required");
  }

  if (String(process.env.AGENT_MULTI_PASS || "0") === "1") {
    try {
      return await planWithAgents({ instruction: cleanInstruction, mode: "desktop" });
    } catch {
      // Fall back to single-pass planner below.
    }
  }

  const client = getClient();
  if (!client) {
    return {
      plan: {
        taskName: cleanInstruction.slice(0, 80) || "Desktop Plan",
        actions: [],
        safety: {
          requireApprovalFor: ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"],
          maxActions: 40,
          approvalMode: "per_run"
        }
      },
      explanation: "OPENAI_API_KEY is not configured; returning an empty plan."
    };
  }

  const system = [
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

  const user = `Instruction: ${cleanInstruction}`;

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
        taskName: cleanInstruction.slice(0, 80) || "Desktop Plan",
        actions: [],
        safety: {
          requireApprovalFor: ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"],
          maxActions: 40,
          approvalMode: "per_run"
        }
      },
      explanation: "Planner returned non-JSON output; returning an empty plan."
    };
  }

  return {
    plan: {
      taskName: plan.taskName || cleanInstruction.slice(0, 80) || "Desktop Plan",
      actions: Array.isArray(plan.actions) ? plan.actions : [],
      safety: plan.safety || {
        requireApprovalFor: ["launch", "input", "key", "mouse", "clipboard", "screenshot", "new_app", "vision", "uia"],
        maxActions: 40,
        approvalMode: "per_run"
      }
    },
    explanation: "Plan generated from instruction."
  };
}
