import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.LENORE_BASE_URL || "http://127.0.0.1:3412/";
const OUT_DIR = process.env.LENORE_AUDIT_OUT_DIR || "c:/Users/grump/Repo/output/playwright/lenore-phase1-regression";

fs.mkdirSync(OUT_DIR, { recursive: true });

async function openAvatarSettings(page) {
  await page.evaluate(() => {
    const settingsButton = [...document.querySelectorAll("button")].find((button) => button.innerText.trim() === "Settings");
    if (!settingsButton) throw new Error("settings_button_not_found");
    settingsButton.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const avatarButton = [...document.querySelectorAll("button")].find((button) => button.innerText.trim() === "Avatar");
    if (!avatarButton) throw new Error("avatar_button_not_found");
    avatarButton.click();
  });
  await page.waitForTimeout(800);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const failures = [];

  page.on("response", (resp) => {
    if (resp.status() >= 400) failures.push({ status: resp.status(), url: resp.url() });
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(OUT_DIR, "paused.png"), fullPage: true });

  await openAvatarSettings(page);
  await page.screenshot({ path: path.join(OUT_DIR, "settings.png"), fullPage: true });

  const selects = await page.locator("select").all();
  if (selects.length >= 2) {
    await selects[1].selectOption("bust");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "frame-bust.png"), fullPage: true });

    await selects[1].selectOption("full");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, "frame-full.png"), fullPage: true });
  }

  await page.locator('input[type="color"]').nth(0).fill("#8d2030");
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT_DIR, "hair-color.png"), fullPage: true });

  for (const label of ["Show Wrap", "Show Opera gloves", "Show Lace stockings", "Show Boots", "Show Spike choker", "Show Piercing"]) {
    const cb = page.locator(`label:has-text("${label}") input[type=checkbox]`).first();
    if (await cb.count()) {
      await cb.click();
      await page.waitForTimeout(300);
    }
  }
  await page.screenshot({ path: path.join(OUT_DIR, "supported-toggles-off.png"), fullPage: true });

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.waitForTimeout(400);
  const enableAudio = page.getByText("Enable Audio");
  if (await enableAudio.count()) {
    await enableAudio.first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const input = page.locator('input[placeholder="Type your message..."]').first();
  await input.fill("Give me a short greeting.");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(OUT_DIR, "speaking.png"), fullPage: true });

  const disabledStates = [];
  await openAvatarSettings(page);
  for (const label of ["Show Jacket", "Show Lingerie top", "Show Lingerie bottoms"]) {
    const cb = page.locator(`label:has-text("${label}") input[type=checkbox]`).first();
    disabledStates.push({
      label,
      disabled: await cb.isDisabled().catch(() => null),
      checked: await cb.isChecked().catch(() => null)
    });
  }

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2200));
  const motion = await page.evaluate(() => window.__lenoreDebug?.motion || null);

  fs.writeFileSync(
    path.join(OUT_DIR, "audit.json"),
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        failures,
        disabledStates,
        motion,
        bodyText
      },
      null,
      2
    )
  );

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
