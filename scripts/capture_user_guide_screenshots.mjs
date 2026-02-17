import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const baseUrl = process.env.UI_URL || "http://localhost:3000";
const outDir = process.env.SCREENSHOT_DIR || path.resolve("docs/user-guide/screenshots");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function capture() {
  await ensureDir(outDir);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const gotoTab = async (tab, params = {}) => {
    const url = new URL(baseUrl);
    if (tab) url.searchParams.set("tab", tab);
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 0));
  };

  const shot = async (name) => {
    const filePath = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
  };

  await gotoTab("chat");
  await shot("chat");

  await gotoTab("recordings");
  await shot("recordings");

  await gotoTab("workbench");
  await shot("tools_workbench");

  await gotoTab("tools");
  await shot("tools_mcp");

  await gotoTab("actionRunner");
  await shot("action_runner");

  await gotoTab("teachMode");
  await shot("teach_mode");

  await gotoTab("fireflies");
  await shot("fireflies");

  await gotoTab("trading", { tradingTab: "terminal" });
  await shot("trading_terminal");

  await gotoTab("trading", { tradingTab: "paper" });
  await shot("trading_paper");

  await gotoTab("trading", { tradingTab: "backtest" });
  await shot("trading_backtest");

  await gotoTab("trading", { tradingTab: "options" });
  await shot("trading_options");

  await gotoTab("trading", { tradingTab: "qa" });
  await shot("trading_qa");

  await gotoTab("trading", { tradingTab: "knowledge" });
  await shot("trading_knowledge");

  await gotoTab("trading", { tradingTab: "scenarios" });
  await shot("trading_scenarios");

  await gotoTab("safety");
  await shot("safety");

  await gotoTab("canvas");
  await shot("canvas");

  await gotoTab("features", { featuresView: "mcp" });
  await shot("features_mcp");

  await gotoTab("features", { featuresView: "connections" });
  await shot("features_connections");

  await gotoTab("settings", { settingsTab: "integrations" });
  await shot("settings_integrations");

  await gotoTab("settings", { settingsTab: "skills" });
  await shot("settings_skills");

  await gotoTab("settings", { settingsTab: "trading" });
  await shot("settings_trading");

  await gotoTab("settings", { settingsTab: "appearance" });
  await shot("settings_appearance");

  await gotoTab("settings", { settingsTab: "voice" });
  await shot("settings_voice");

  await gotoTab("debug");
  await shot("debug");

  await gotoTab("guide");
  await shot("guide");

  // Standalone pages
  await page.goto(`${baseUrl}/signals`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot("signals_page");

  await page.goto(`${baseUrl}/fireflies-rag`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot("fireflies_rag_page");

  await page.goto(`${baseUrl}/trading`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot("trading_full_page");

  await browser.close();
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
