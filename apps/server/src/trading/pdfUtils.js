import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const candidate = path.join(cwd, "apps", "server");
  if (fs.existsSync(candidate)) return cwd;
  return path.resolve(cwd, "..", "..");
}

const repoRoot = resolveRepoRoot();
const defaultCacheDir = path.join(repoRoot, "apps", "server", "data", "ocr_cache");
const DEFAULT_OCR_MAX_PAGES = Number(process.env.TRADING_RAG_OCR_MAX_PAGES || 0);
const DEFAULT_OCR_SCALE = Number(process.env.TRADING_RAG_OCR_SCALE || 2.0);

let ocrWorker = null;
let ocrDeps = null;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function loadOcrDeps() {
  if (ocrDeps) return ocrDeps;
  const pdfModule = await (async () => {
    try {
      return await import("pdfjs-dist/legacy/build/pdf.mjs");
    } catch {
      return await import("pdfjs-dist/legacy/build/pdf.js");
    }
  })();
  const [tesseract, canvasMod] = await Promise.all([
    import("tesseract.js"),
    import("@napi-rs/canvas")
  ]);
  const createCanvas = canvasMod?.createCanvas || canvasMod?.default?.createCanvas;
  if (!createCanvas) throw new Error("canvas_unavailable");
  ocrDeps = {
    createWorker: tesseract.createWorker,
    createCanvas,
    pdfjsLib: pdfModule?.default || pdfModule
  };
  return ocrDeps;
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  const { createWorker } = await loadOcrDeps();
  ensureDir(defaultCacheDir);
  ocrWorker = await createWorker("eng", undefined, { cachePath: defaultCacheDir });
  return ocrWorker;
}

function buildCachePath(cacheKey = "") {
  if (!cacheKey) return "";
  const hash = crypto.createHash("sha1").update(String(cacheKey)).digest("hex");
  return path.join(defaultCacheDir, `${hash}.txt`);
}

async function ocrPdfBuffer(buffer, { maxPages = DEFAULT_OCR_MAX_PAGES, scale = DEFAULT_OCR_SCALE } = {}) {
  const { pdfjsLib, createCanvas } = await loadOcrDeps();
  const pdfData = buffer instanceof Uint8Array
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages || 0;
  const pagesToProcess = maxPages && maxPages > 0 ? Math.min(maxPages, totalPages) : totalPages;
  if (!pagesToProcess) return "";

  const worker = await getOcrWorker();
  const results = [];
  for (let pageNum = 1; pageNum <= pagesToProcess; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const image = canvas.toBuffer("image/png");
    const { data } = await worker.recognize(image);
    const text = String(data?.text || "").trim();
    if (text) results.push(text);
  }
  return results.join("\n\n");
}

export async function extractPdfText(buffer, { useOcr = false, cacheKey = "", ocrMaxPages, ocrScale } = {}) {
  const parsed = await pdfParse(buffer);
  const parsedText = String(parsed?.text || "");
  if (parsedText.trim()) {
    return { text: parsedText, method: "pdf-parse" };
  }
  if (!useOcr) {
    return { text: "", method: "none" };
  }

  ensureDir(defaultCacheDir);
  const cachePath = buildCachePath(cacheKey);
  if (cachePath && fs.existsSync(cachePath)) {
    const cached = fs.readFileSync(cachePath, "utf8");
    if (cached.trim()) return { text: cached, method: "ocr_cache" };
  }

  const ocrText = await ocrPdfBuffer(buffer, { maxPages: ocrMaxPages, scale: ocrScale });
  if (cachePath && ocrText.trim()) {
    fs.writeFileSync(cachePath, ocrText, "utf8");
  }
  return { text: ocrText, method: "ocr" };
}

export async function shutdownOcrWorker() {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}
