import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

async function main() {
  const outDir = "c:/Users/grump/Repo/output/playwright/lenore-phase3";
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 1100 } });
  await page.goto("http://127.0.0.1:3412/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => window.__lenoreDebug && window.__lenoreDebug.root, null, { timeout: 120000 });

  const states = [
    {
      name: "paused",
      override: {
        mood: "neutral",
        isTalking: false,
        isListening: false,
        motion: {
          idleState: "paused",
          responseClass: "neutral",
          choreographyPreset: "quiet_poise",
          motionIntensity: 0.35
        },
        appearance: { cameraFrame: "bust" }
      }
    },
    {
      name: "listening",
      override: {
        mood: "neutral",
        isTalking: false,
        isListening: true,
        motion: {
          idleState: "listening",
          responseClass: "comfort",
          choreographyPreset: "soft_reassure",
          motionIntensity: 0.4
        },
        appearance: { cameraFrame: "bust" }
      }
    },
    {
      name: "thinking",
      override: {
        mood: "thinking",
        isTalking: false,
        isListening: false,
        motion: {
          idleState: "thinking",
          responseClass: "reflective",
          choreographyPreset: "quiet_poise",
          motionIntensity: 0.36
        },
        appearance: { cameraFrame: "bust" }
      }
    },
    {
      name: "speaking",
      override: {
        mood: "neutral",
        isTalking: true,
        isListening: false,
        talkIntensity: 0.62,
        motion: {
          idleState: "speaking",
          responseClass: "executive",
          choreographyPreset: "command_presence",
          motionIntensity: 0.52
        },
        appearance: { cameraFrame: "bust" }
      }
    }
  ];

  const results = [];
  for (const state of states) {
    await page.evaluate((ovr) => {
      window.__lenoreDebug.override = {
        ...window.__lenoreDebug.override,
        ...ovr,
        motion: { ...(window.__lenoreDebug.override?.motion || {}), ...(ovr.motion || {}) },
        appearance: { ...(window.__lenoreDebug.override?.appearance || {}), ...(ovr.appearance || {}) }
      };
    }, state.override);
    await page.waitForTimeout(1600);
    const file = path.join(outDir, `${state.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const debug = await page.evaluate(() => {
      const dbg = window.__lenoreDebug || {};
      return {
        motion: dbg.motion || null,
        hasRoot: Boolean(dbg.root),
        camera: dbg.camera ? { x: dbg.camera.position.x, y: dbg.camera.position.y, z: dbg.camera.position.z } : null
      };
    });
    results.push({ state: state.name, file, debug });
  }

  fs.writeFileSync(path.join(outDir, "audit.json"), JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
