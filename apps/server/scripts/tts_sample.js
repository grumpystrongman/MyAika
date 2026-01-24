import { generateAikaVoice } from "../aika_voice/index.js";

const text = process.argv.slice(2).join(" ") || "Okay, try me. This is Aika Voice.";

async function run() {
  try {
    const result = await generateAikaVoice({
      text,
      settings: { style: "brat_baddy", format: "wav" }
    });
    console.log("Aika Voice file:", result.filePath);
    console.log("Meta:", result.meta);
  } catch (err) {
    console.error("Aika Voice sample failed:", err.message || err);
    process.exit(1);
  }
}

run();
