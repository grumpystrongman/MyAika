import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseDir = "c:/Users/grump/Repo/output/playwright/lenore-review";
fs.mkdirSync(baseDir, { recursive: true });

const baseUrl = "http://127.0.0.1:3412/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePageReady(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);
  const enableAudio = page.getByRole("button", { name: /enable audio/i });
  if (await enableAudio.count()) {
    await enableAudio.click();
    await page.waitForTimeout(600);
  }
}

async function sendPrompt(page, prompt) {
  const input = page.locator('input[placeholder="Type your message..."]');
  await input.fill(prompt);
  await page.getByRole("button", { name: /^send$/i }).click();
}

async function getDebugState(page) {
  return await page.evaluate(() => {
    const debug = window.__lenoreDebug;
    const result = {
      motion: debug?.motion || null,
      morphs: {},
      text: document.body.innerText
    };
    if (!debug?.root) return result;
    const track = [
      "Mouth_Plosive",
      "V_Explosive",
      "V_Tight_O",
      "Mouth_Pucker",
      "Mouth_Pucker_Open",
      "V_Wide",
      "Mouth_Widen",
      "Mouth_Open",
      "V_Open",
      "V_Dental_Lip",
      "V_Affricate"
    ];
    for (const name of track) result.morphs[name] = 0;
    debug.root.traverse((node) => {
      if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
      for (const name of track) {
        const idx = node.morphTargetDictionary[name];
        if (idx != null) {
          result.morphs[name] = Math.max(result.morphs[name], Number(node.morphTargetInfluences[idx] || 0));
        }
      }
    });
    return result;
  });
}

async function waitForCondition(page, predicate, timeoutMs = 15000, intervalMs = 180) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await getDebugState(page);
    if (predicate(last)) return last;
    await sleep(intervalMs);
  }
  return last;
}

async function openAvatarSettings(page) {
  await page.getByRole("button", { name: /avatar settings/i }).first().click();
  await page.waitForTimeout(800);
}

async function selectFrame(page, value) {
  const selects = page.locator("select");
  await selects.nth(1).selectOption(value);
  await page.waitForTimeout(800);
}

async function capturePhonemeReview(page) {
  const cases = [
    {
      name: "plosive",
      prompt: 'Repeat exactly this phrase in one line: "Bam. Pop. Baby."',
      predicate: (state) => (state?.morphs?.Mouth_Plosive || 0) > 0.45
    },
    {
      name: "rounded",
      prompt: 'Repeat exactly this phrase in one line: "Ooh, who knew?"',
      predicate: (state) => Math.max(state?.morphs?.V_Tight_O || 0, state?.morphs?.Mouth_Pucker || 0) > 0.35
    },
    {
      name: "wide",
      prompt: 'Repeat exactly this phrase in one line: "See me, sweetie."',
      predicate: (state) => Math.max(state?.morphs?.V_Wide || 0, state?.morphs?.Mouth_Widen || 0) > 0.32
    },
    {
      name: "open",
      prompt: 'Repeat exactly this phrase in one line: "Ahh, at last."',
      predicate: (state) => Math.max(state?.morphs?.Mouth_Open || 0, state?.morphs?.V_Open || 0) > 0.32
    }
  ];
  const results = [];
  for (const item of cases) {
    await ensurePageReady(page);
    await sendPrompt(page, item.prompt);
    const state = await waitForCondition(page, item.predicate);
    const file = path.join(baseDir, `phoneme-${item.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({ name: item.name, file, state });
  }
  return results;
}

async function captureFrameReview(page) {
  const frames = ["portrait", "bust", "waist", "three_quarter", "full"];
  const results = [];
  await ensurePageReady(page);
  await openAvatarSettings(page);
  for (const frame of frames) {
    await selectFrame(page, frame);
    const file = path.join(baseDir, `frame-${frame}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({ frame, file });
  }
  return results;
}

async function captureChoreographyReview(page) {
  const runs = [
    {
      name: "teasing",
      prompt: "Reply in one short teasing sentence. Do not ask a question.",
      predicate: (state) => state?.motion?.responseClass === "teasing"
    },
    {
      name: "executive",
      prompt: "Reply in one short firm executive sentence. Do not ask a question.",
      predicate: (state) => state?.motion?.clipKind === "runtime_pose"
    },
    {
      name: "comfort",
      prompt: "Reply in one short warm comforting sentence. Do not ask a question.",
      predicate: (state) => state?.motion?.responseClass === "comfort"
    }
  ];
  const results = [];
  for (const run of runs) {
    await ensurePageReady(page);
    await sendPrompt(page, run.prompt);
    const state = await waitForCondition(page, run.predicate);
    const file = path.join(baseDir, `choreo-${run.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({ name: run.name, file, state });
  }
  return results;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const review = {
  generatedAt: new Date().toISOString(),
  phonemes: await capturePhonemeReview(page),
  frames: await captureFrameReview(page),
  choreography: await captureChoreographyReview(page)
};

fs.writeFileSync(path.join(baseDir, "review.json"), JSON.stringify(review, null, 2));
await browser.close();

console.log(JSON.stringify(review, null, 2));
