import { sendChat, runModule, runRunbook } from "../../client.js";

export const flowiseNodeMeta = {
  id: "openaegis-flowise",
  name: "OpenAegis for Flowise",
  category: "Tools",
  description: "OpenAegis node/plugin package for Flowise agent chains.",
  inputs: [
    { name: "mode", type: "string", options: ["chat", "module", "runbook"], default: "chat" },
    { name: "prompt", type: "string", default: "" },
    { name: "moduleName", type: "string", default: "" },
    { name: "runbookName", type: "string", default: "" }
  ]
};

export async function runFlowiseNode(input = {}) {
  const mode = String(input.mode || "chat").toLowerCase();
  if (mode === "module") {
    return runModule(input.moduleName || "", input.inputPayload || {});
  }
  if (mode === "runbook") {
    return runRunbook(input.runbookName || "", input.inputPayload || {});
  }
  const message = input.prompt || input.userText || "";
  return sendChat(message, input.context || {});
}
