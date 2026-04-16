import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:3412/";
const baseDir = "c:/Users/grump/Repo/output/playwright/lenore-review-pass5";
fs.mkdirSync(baseDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePageReady(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);
  const enableAudio = page.getByRole("button", { name: /enable audio/i });
  if (await enableAudio.count()) {
    await enableAudio.click();
    await page.waitForTimeout(500);
  }
}

async function openAvatarSettings(page) {
  const stageButton = page.getByRole("button", { name: /avatar settings/i }).first();
  if (await stageButton.count()) {
    try {
      await stageButton.click({ timeout: 4000 });
      await page.waitForTimeout(1000);
      return;
    } catch {}
  }
  const settingsTab = page.getByRole("button", { name: /^settings$/i }).first();
  if (await settingsTab.count()) {
    await settingsTab.click({ timeout: 5000 });
    await page.waitForTimeout(600);
  }
  const avatarTab = page.getByRole("button", { name: /^avatar$/i }).first();
  await avatarTab.click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

async function forceMorphPreview(page, targets) {
  return await page.evaluate((previewTargets) => {
    const debug = window.__lenoreDebug;
    if (!debug?.root) return { ok: false, reason: "missing_root" };
    const tracked = {};
    debug.root.traverse((node) => {
      if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
      Object.entries(node.morphTargetDictionary).forEach(([name, idx]) => {
        node.morphTargetInfluences[idx] = 0;
      });
      Object.entries(previewTargets || {}).forEach(([name, value]) => {
        const idx = node.morphTargetDictionary[name];
        if (idx != null) {
          node.morphTargetInfluences[idx] = Number(value) || 0;
          tracked[name] = Math.max(tracked[name] || 0, Number(value) || 0);
        }
      });
    });
    debug.override = {
      isTalking: false,
      isListening: false,
      motion: {
        responseClass: "neutral",
        choreographyPreset: "quiet_poise",
        idleState: "paused",
        motionIntensity: 0.45
      }
    };
    return { ok: true, tracked };
  }, targets);
}

async function setMotionOverride(page, motion) {
  return await page.evaluate((overrideMotion) => {
    const debug = window.__lenoreDebug;
    if (!debug) return { ok: false };
    debug.override = {
      mood: overrideMotion.mood || "neutral",
      isTalking: Boolean(overrideMotion.isTalking),
      isListening: Boolean(overrideMotion.isListening),
      motion: {
        clipName: overrideMotion.clipName || "auto",
        choreographyPreset: overrideMotion.choreographyPreset || "auto",
        responseClass: overrideMotion.responseClass || "neutral",
        idleState: overrideMotion.idleState || "speaking",
        motionIntensity: overrideMotion.motionIntensity ?? 0.7,
        playClip: true,
        clipSpeed: 0.88,
        clipWeight: 1,
        idleHead: 0.4,
        talkHead: 0.28,
        bodySway: 0.22
      }
    };
    return debug.motion || null;
  }, motion);
}

async function clearOverrides(page) {
  await page.evaluate(() => {
    if (window.__lenoreDebug) window.__lenoreDebug.override = null;
  });
}

async function capturePhonemePreviews(page) {
  const cases = [
    {
      name: "phoneme-th",
      targets: {
        V_Tongue_Out: 0.48,
        Mouth_Top_Lip_Up: 0.24,
        V_Dental_Lip: 0.32,
        Mouth_Lips_Part: 0.12,
        Mouth_Open: 0.04
      }
    },
    {
      name: "phoneme-s",
      targets: {
        V_Affricate: 0.52,
        V_Dental_Lip: 0.2,
        Mouth_Widen: 0.14,
        Mouth_Top_Lip_Up: 0.08,
        Mouth_Lips_Part: 0.11,
        Mouth_Open: 0.02
      }
    },
    {
      name: "phoneme-ch",
      targets: {
        V_Affricate: 0.82,
        Mouth_Lips_Part: 0.18,
        Mouth_Open: 0.05,
        Mouth_Widen: 0.1,
        Mouth_Pucker_Open: 0.08,
        Mouth_Top_Lip_Up: 0.04
      }
    }
  ];
  const out = [];
  for (const item of cases) {
    const state = await forceMorphPreview(page, item.targets);
    await page.waitForTimeout(400);
    const file = path.join(baseDir, `${item.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    out.push({ name: item.name, file, state });
  }
  await clearOverrides(page);
  return out;
}

async function captureChoreographyPreviews(page) {
  const cases = [
    {
      name: "choreo-velvet-tease",
      motion: { choreographyPreset: "velvet_tease", responseClass: "teasing", idleState: "speaking", isTalking: true, clipName: "source_motion", mood: "teasing" }
    },
    {
      name: "choreo-command-presence",
      motion: { choreographyPreset: "command_presence", responseClass: "executive", idleState: "speaking", isTalking: true, clipName: "runtime_pose", mood: "serious" }
    },
    {
      name: "choreo-soft-reassure",
      motion: { choreographyPreset: "soft_reassure", responseClass: "comfort", idleState: "speaking", isTalking: true, clipName: "runtime_pose", mood: "warm_supportive" }
    }
  ];
  const out = [];
  for (const item of cases) {
    const state = await setMotionOverride(page, item.motion);
    await page.waitForTimeout(900);
    const file = path.join(baseDir, `${item.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const debugState = await page.evaluate(() => window.__lenoreDebug?.motion || null);
    out.push({ name: item.name, file, state, debugState });
  }
  await clearOverrides(page);
  return out;
}

async function captureLookSlots(page) {
  await openAvatarSettings(page);
  const savedLooks = page.getByText("Saved Looks", { exact: true });
  await savedLooks.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const panelFile = path.join(baseDir, "look-slots-panel.png");
  await page.screenshot({ path: panelFile, fullPage: true });

  const revealButton = page.getByRole("button", { name: /apply reveal look/i }).first();
  await revealButton.click();
  await page.waitForTimeout(900);
  const revealFile = path.join(baseDir, "look-slot-reveal-applied.png");
  await page.screenshot({ path: revealFile, fullPage: true });

  const formalButton = page.getByRole("button", { name: /apply formal look/i }).first();
  await formalButton.click();
  await page.waitForTimeout(900);
  const formalFile = path.join(baseDir, "look-slot-formal-applied.png");
  await page.screenshot({ path: formalFile, fullPage: true });

  const slotMeta = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasFrameLabel: /Frame:\s+(Portrait|Bust|Waist|Three-quarter|Full body)/i.test(text),
      hasChoreoLabel: /Choreo:/i.test(text),
      hasMotionLabel: /Motion:/i.test(text)
    };
  });

  return {
    panelFile,
    revealFile,
    formalFile,
    slotMeta
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await ensurePageReady(page);
const review = {
  generatedAt: new Date().toISOString(),
  phonemes: await capturePhonemePreviews(page),
  choreography: await captureChoreographyPreviews(page),
  lookSlots: await captureLookSlots(page)
};

fs.writeFileSync(path.join(baseDir, "review.json"), JSON.stringify(review, null, 2));
await browser.close();
console.log(JSON.stringify(review, null, 2));
