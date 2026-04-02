import { sendChat, runModule, runRunbook } from "../../src/client.js";

export class OpenAegis {
  description = {
    displayName: "OpenAegis",
    name: "openAegis",
    icon: "file:openaegis.svg",
    group: ["transform"],
    version: 1,
    description: "OpenAegis community node for n8n workflow automation.",
    defaults: { name: "OpenAegis" },
    inputs: ["main"],
    outputs: ["main"],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        default: "chat",
        options: [
          { name: "Chat", value: "chat" },
          { name: "Run Module", value: "module" },
          { name: "Run Runbook", value: "runbook" }
        ]
      },
      { displayName: "Prompt", name: "prompt", type: "string", default: "", displayOptions: { show: { operation: ["chat"] } } },
      { displayName: "Module Name", name: "moduleName", type: "string", default: "", displayOptions: { show: { operation: ["module"] } } },
      { displayName: "Runbook Name", name: "runbookName", type: "string", default: "", displayOptions: { show: { operation: ["runbook"] } } }
    ]
  };

  async execute() {
    const items = this.getInputData();
    const returnData = [];
    for (let index = 0; index < items.length; index += 1) {
      const operation = this.getNodeParameter("operation", index, "chat");
      let payload;
      if (operation === "module") {
        payload = await runModule(this.getNodeParameter("moduleName", index, ""), {});
      } else if (operation === "runbook") {
        payload = await runRunbook(this.getNodeParameter("runbookName", index, ""), {});
      } else {
        payload = await sendChat(this.getNodeParameter("prompt", index, ""), {});
      }
      returnData.push({ json: payload });
    }
    return [returnData];
  }
}
