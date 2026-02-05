// UI smoke test (Playwright)
// Usage: node scripts/ui_smoke.js
const UI_BASE = process.env.UI_BASE_URL || "http://127.0.0.1:3000";
const timeoutMs = Number(process.env.UI_SMOKE_TIMEOUT_MS || 45000);

async function run() {
  let chromium;
  try {
    ({ chromium } = require("@playwright/test"));
  } catch (err) {
    console.error("Playwright is not installed. Run: npm install");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);

  try {
    await page.goto(UI_BASE, { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByPlaceholder("Type your message...").waitFor();

    await page.getByRole("button", { name: "Recordings", exact: true }).click();
    await page.getByPlaceholder("Search recordings").waitFor();

    await page.getByRole("button", { name: "Aika Tools", exact: true }).click();
    await page.getByText("Aika Tools v1").waitFor();

    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await page.getByText("MCP-lite Tools").waitFor();

    await page.getByRole("button", { name: "Features", exact: true }).click();
    await page.getByText("MCP Features").waitFor();

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByText("Connect services for Aika's agent mode").waitFor();

    await page.getByRole("button", { name: "Debug", exact: true }).click();
    await page.getByText("System Status").waitFor();

    await page.getByRole("button", { name: "Guide", exact: true }).click();
    await page.getByText("Quickstart Guide + Demo Prompts").waitFor();

    console.log("UI smoke passed.");
  } catch (err) {
    console.error(`UI smoke failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
