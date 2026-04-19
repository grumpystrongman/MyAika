import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const outDir = "c:/Users/grump/Repo/output/playwright/lenore-phase4";
fs.mkdirSync(outDir, { recursive: true });

const empathyCases = [
  {
    name: "comfort",
    override: {
      blink: 0,
      mood: "concerned",
      isTalking: false,
      isListening: true,
      motion: {
        idleState: "listening",
        responseClass: "comfort",
        empathyMode: "co_regulate",
        choreographyPreset: "soft_reassure",
        motionIntensity: 0.42
      },
      appearance: { cameraFrame: "portrait" }
    }
  },
  {
    name: "executive",
    override: {
      blink: 0,
      mood: "neutral",
      isTalking: false,
      isListening: false,
      motion: {
        idleState: "thinking",
        responseClass: "executive",
        empathyMode: "competent",
        choreographyPreset: "command_presence",
        motionIntensity: 0.5
      },
      appearance: { cameraFrame: "portrait" }
    }
  },
  {
    name: "playful",
    override: {
      blink: 0,
      mood: "teasing",
      isTalking: false,
      isListening: false,
      motion: {
        idleState: "ready",
        responseClass: "teasing",
        empathyMode: "play",
        choreographyPreset: "quiet_poise",
        motionIntensity: 0.46
      },
      appearance: { cameraFrame: "portrait" }
    }
  }
];

const phonemeCases = [
  { name: "phoneme-th", phoneme: "th", duration: 120 },
  { name: "phoneme-s", phoneme: "s", duration: 120 },
  { name: "phoneme-ch", phoneme: "ch", duration: 120 },
  { name: "phoneme-ah", phoneme: "a", duration: 120 }
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 1100 } });
  await page.goto("http://127.0.0.1:3412/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(() => window.__lenoreDebug && window.__lenoreDebug.root, null, { timeout: 120000 });

  const results = [];

  for (const item of empathyCases) {
    await page.evaluate((ovr) => {
      window.__lenoreDebug.override = {
        ...window.__lenoreDebug.override,
        ...ovr,
        motion: { ...(window.__lenoreDebug.override?.motion || {}), ...(ovr.motion || {}) },
        appearance: { ...(window.__lenoreDebug.override?.appearance || {}), ...(ovr.appearance || {}) }
      };
    }, item.override);
    await page.waitForTimeout(900);
    const file = path.join(outDir, `${item.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({ type: "empathy", name: item.name, file });
  }

  for (const item of phonemeCases) {
    await page.evaluate((data) => {
      window.__lenoreDebug.override = {
        ...window.__lenoreDebug.override,
        blink: 0,
        mood: "neutral",
        isTalking: true,
        isListening: false,
        talkIntensity: 0.68,
        lipsyncSequence: {
          sequences: [
            { time: 0, duration: data.duration, phoneme: data.phoneme, blendshapes: {} }
          ]
        },
        lipsyncStartTimeMs: performance.now() - 40,
        motion: {
          ...(window.__lenoreDebug.override?.motion || {}),
          idleState: "speaking",
          responseClass: "executive",
          empathyMode: "competent",
          choreographyPreset: "command_presence",
          motionIntensity: 0.5
        },
        appearance: {
          ...(window.__lenoreDebug.override?.appearance || {}),
          cameraFrame: "portrait"
        }
      };
    }, item);
    await page.waitForTimeout(350);
    const file = path.join(outDir, `${item.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({ type: "phoneme", name: item.name, file });
  }

  fs.writeFileSync(path.join(outDir, "audit.json"), JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
