import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function guessModelId(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes("hiyori")) return "hiyori";
  if (lower.includes("mao")) return "mao";
  if (lower.includes("tororo")) return "tororo_hijiki";
  if (lower.includes("shizuku")) return "shizuku";
  if (lower.includes("hibiki")) return "hibiki";
  return null;
}

function titleize(id) {
  return id
    .split(/[_-]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function importLive2DZip({
  zipPath,
  webPublicDir
}) {
  const live2dDir = path.join(webPublicDir, "assets", "aika", "live2d");
  const manifestPath = path.join(live2dDir, "models.json");
  ensureDir(live2dDir);

  const tempDir = path.join(webPublicDir, "..", "..", "..", "data", "_live2d_uploads", Date.now().toString(36));
  ensureDir(tempDir);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);

  const modelFiles = [];
  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (item.endsWith(".model3.json")) modelFiles.push(full);
    }
  }
  walk(tempDir);

  let manifest = { models: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {
      manifest = { models: [] };
    }
  }

  const models = Array.isArray(manifest.models) ? manifest.models : [];
  for (const modelFile of modelFiles) {
    const modelDir = path.dirname(modelFile);
    const modelFileName = path.basename(modelFile);
    let modelId = guessModelId(modelFile);
    if (!modelId) {
      modelId = slugify(path.basename(modelDir));
    }
    if (!modelId) continue;

    const targetDir = path.join(live2dDir, modelId);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });

    // Copy model folder to target
    copyDir(modelDir, targetDir);

    // Thumbnail
    const thumb = path.join(targetDir, "thumb.png");
    if (!fs.existsSync(thumb)) {
      const png = findFirstPng(targetDir);
      if (png) fs.copyFileSync(png, thumb);
    }

    const modelUrl = `/assets/aika/live2d/${modelId}/${modelFileName}`;
    const fallbackPng = "/assets/aika/AikaPregnant.png";
    const existing = models.find(m => m.id === modelId);
    if (existing) {
      existing.modelUrl = modelUrl;
      existing.fallbackPng = fallbackPng;
      existing.thumbnail = `/assets/aika/live2d/${modelId}/thumb.png`;
    } else {
      models.push({
        id: modelId,
        label: `${titleize(modelId)} (Imported)`,
        modelUrl,
        fallbackPng,
        thumbnail: `/assets/aika/live2d/${modelId}/thumb.png`,
        source: "uploaded"
      });
    }
  }

  manifest.models = models;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  fs.rmSync(tempDir, { recursive: true, force: true });
  return manifest.models;
}

function copyDir(src, dst) {
  const items = fs.readdirSync(src, { withFileTypes: true });
  for (const item of items) {
    const s = path.join(src, item.name);
    const d = path.join(dst, item.name);
    if (item.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function findFirstPng(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      const res = findFirstPng(full);
      if (res) return res;
    } else if (item.name.toLowerCase().endsWith(".png")) {
      return full;
    }
  }
  return null;
}
