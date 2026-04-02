import { healthCheck, sendChat, runModule, runRunbook } from "./client.js";

export function createOpenaegisLangflowPlugin() {
  return {
    id: "openaegis-langflow",
    host: "langflow",
    name: "OpenAegis for Langflow",
    capabilities: ["chat","module-execution","runbooks","watchtower"],
    actions: {
      healthCheck,
      sendChat,
      runModule,
      runRunbook
    }
  };
}

if (process.argv.includes("--self-check")) {
  healthCheck()
    .then(payload => {
      console.log("OpenAegis plugin self-check ok:", JSON.stringify(payload));
      process.exit(0);
    })
    .catch(err => {
      console.error("OpenAegis plugin self-check failed:", err?.message || err);
      process.exit(1);
    });
}
