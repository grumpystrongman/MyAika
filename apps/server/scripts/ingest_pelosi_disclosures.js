import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { ingestTradingDocument } from "../src/trading/knowledgeRag.js";
import { extractPdfText, shutdownOcrWorker } from "../src/trading/pdfUtils.js";

const BASE_ZIP_URL = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs";
const BASE_PDF_URL = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs";
const BASE_PTR_URL = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");
const defaultCacheDir = path.join(repoRoot, "apps", "server", "data", "pelosi_disclosures");
const DEFAULT_OCR_MAX_PAGES = Number(process.env.PELOSI_OCR_MAX_PAGES || 0);
const DEFAULT_OCR_SCALE = Number(process.env.PELOSI_OCR_SCALE || 1.8);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      opts[key] = next;
      i += 1;
    } else {
      opts[key] = true;
    }
  }
  return opts;
}

function parseDate(value) {
  if (!value) return "";
  const match = String(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return "";
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const iso = new Date(Date.UTC(year, month - 1, day)).toISOString();
  return iso;
}

function normalizeLine(value) {
  return String(value || "").trim();
}


function parseDisclosureTxt(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines.shift().split("\t").map(normalizeLine);
  const rows = [];
  for (const line of lines) {
    const cols = line.split("\t");
    const row = {};
    header.forEach((key, idx) => {
      row[key] = normalizeLine(cols[idx]);
    });
    rows.push(row);
  }
  return rows;
}

function extractTransactionsSnippet(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  const markers = ["transactions", "transaction", "schedule c", "part 4", "part 3", "assets"];
  let idx = -1;
  for (const marker of markers) {
    const found = lower.indexOf(marker);
    if (found !== -1) {
      idx = found;
      break;
    }
  }
  if (idx === -1) return raw;
  const start = Math.max(0, idx - 2000);
  const end = Math.min(raw.length, idx + 60000);
  return raw.slice(start, end);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBuffer(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "AikaTradingRAG/1.0" },
      signal: controller.signal
    });
    if (!resp.ok) {
      throw new Error(`fetch_failed_${resp.status}`);
    }
    const data = await resp.arrayBuffer();
    return Buffer.from(data);
  } finally {
    clearTimeout(timer);
  }
}

async function downloadZip(year) {
  const candidates = [
    `${BASE_ZIP_URL}/${year}FD.zip`,
    `${BASE_ZIP_URL}/${year}FD.ZIP`
  ];
  for (const url of candidates) {
    try {
      const buffer = await fetchBuffer(url, 30000);
      return { url, buffer };
    } catch (err) {
      if (String(err?.message || "").includes("fetch_failed_404")) {
        continue;
      }
      throw err;
    }
  }
  return null;
}

function buildPdfUrl(year, docId, filingType) {
  const type = String(filingType || "").toUpperCase();
  if (type === "P") {
    return `${BASE_PTR_URL}/${year}/${docId}.pdf`;
  }
  return `${BASE_PDF_URL}/${year}/${docId}.pdf`;
}

function mapFilingType(type) {
  const code = String(type || "").toUpperCase();
  if (code === "P") return "ptr";
  if (code === "O") return "annual";
  if (code === "C") return "candidate";
  return code ? `type_${code}` : "unknown";
}

async function main() {
  const opts = parseArgs();
  const now = new Date();
  const defaultEnd = now.getFullYear() - 1;
  const endYear = Number(opts.end || defaultEnd);
  const startYear = Number(opts.start || (endYear - 19));
  const force = Boolean(opts.force);
  const dryRun = Boolean(opts["dry-run"] || opts.dryRun);
  const maxDocs = opts.maxDocs ? Number(opts.maxDocs) : null;
  const delayMs = opts.delayMs ? Number(opts.delayMs) : 700;
  const cacheDir = opts.cacheDir ? path.resolve(opts.cacheDir) : defaultCacheDir;
  const enableOcr = Boolean(opts.ocr || process.env.PELOSI_OCR === "1");
  const ocrMaxPages = opts.ocrMaxPages ? Number(opts.ocrMaxPages) : DEFAULT_OCR_MAX_PAGES;
  const ocrScale = opts.ocrScale ? Number(opts.ocrScale) : DEFAULT_OCR_SCALE;

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    throw new Error("Invalid year range.");
  }
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const allDocs = [];
  for (let year = startYear; year <= endYear; year += 1) {
    try {
      console.log(`[pelosi] Fetching disclosures index for ${year}...`);
      const zipResult = await downloadZip(year);
      if (!zipResult) {
        console.log(`[pelosi] No disclosure zip found for ${year}.`);
        continue;
      }
      const zip = new AdmZip(zipResult.buffer);
      const txtEntry = zip.getEntry(`${year}FD.txt`) || zip.getEntry(`${year}FD.TXT`);
      if (!txtEntry) {
        console.log(`[pelosi] Missing ${year}FD.txt inside zip.`);
        continue;
      }
      const txt = zip.readAsText(txtEntry);
      const rows = parseDisclosureTxt(txt);
      const matches = rows.filter(row => {
        const last = String(row.Last || "").toLowerCase();
        const first = String(row.First || "").toLowerCase();
        return last === "pelosi" && first.startsWith("nancy");
      });
      matches.forEach(row => {
        const docId = String(row.DocID || "").trim();
        if (!docId) return;
        allDocs.push({
          year: Number(row.Year || year),
          docId,
          filingType: row.FilingType || "",
          filingDate: row.FilingDate || "",
          stateDst: row.StateDst || "",
          sourceZip: zipResult.url
        });
      });
      console.log(`[pelosi] ${year} found ${matches.length} filing(s).`);
    } catch (err) {
      console.log(`[pelosi] Error loading ${year}: ${err?.message || err}`);
    }
  }

  const seen = new Set();
  const docs = allDocs.filter(doc => {
    if (seen.has(doc.docId)) return false;
    seen.add(doc.docId);
    return true;
  }).sort((a, b) => {
    const yearDiff = (a.year || 0) - (b.year || 0);
    if (yearDiff !== 0) return yearDiff;
    return String(a.filingDate || "").localeCompare(String(b.filingDate || ""));
  });

  console.log(`[pelosi] Total unique filings: ${docs.length}`);
  if (dryRun) {
    console.log("[pelosi] Dry run: skipping PDF ingestion.");
    return;
  }

  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  for (const doc of docs) {
    if (maxDocs && ingested + skipped >= maxDocs) break;
    const pdfUrl = buildPdfUrl(doc.year, doc.docId, doc.filingType);
    const cachePath = path.join(cacheDir, `${doc.year}_${doc.docId}.pdf`);
    try {
      if (!fs.existsSync(cachePath) || force) {
        console.log(`[pelosi] Downloading PDF ${doc.docId} (${doc.year})...`);
        const buffer = await fetchBuffer(pdfUrl, 45000);
        fs.writeFileSync(cachePath, buffer);
      }
      const pdfBuffer = fs.readFileSync(cachePath);
      const cacheKey = `${doc.year}_${doc.docId}`;
      if (enableOcr) {
        console.log(`[pelosi] OCR processing ${doc.docId} (${doc.year})...`);
      }
      const resultText = await extractPdfText(pdfBuffer, {
        useOcr: enableOcr,
        cacheKey,
        ocrMaxPages,
        ocrScale
      });
      const finalText = String(resultText?.text || "");
      if (!finalText.trim()) {
        console.log(`[pelosi] Empty text for ${doc.docId}.`);
        failed += 1;
        continue;
      }

      const snippet = extractTransactionsSnippet(finalText);
      const headerLines = [
        "Nancy Pelosi Financial Disclosure",
        `Year: ${doc.year}`,
        `Filing Type: ${doc.filingType || "?"}`,
        `Filing Date: ${doc.filingDate || "?"}`,
        `Document ID: ${doc.docId}`,
        `Source: ${pdfUrl}`,
        "Source System: House Clerk Financial Disclosures"
      ];
      const text = `${headerLines.join("\n")}\n\n${snippet}`;
      const title = `Nancy Pelosi Disclosure ${doc.year} ${doc.filingType || ""}`.trim();
      const tagType = mapFilingType(doc.filingType);
      const tags = [
        "pelosi",
        "nancy-pelosi",
        "congress",
        "financial-disclosure",
        "house-clerk",
        tagType,
        `year-${doc.year}`
      ].filter(Boolean);

      const result = await ingestTradingDocument({
        kind: "disclosure",
        title,
        sourceUrl: pdfUrl,
        text,
        tags,
        sourceGroup: "house_disclosures:pelosi",
        occurredAt: parseDate(doc.filingDate)
      });

      if (result?.skipped) {
        skipped += 1;
        console.log(`[pelosi] Skipped ${doc.docId} (already ingested).`);
      } else if (result?.ok) {
        ingested += 1;
        console.log(`[pelosi] Ingested ${doc.docId} (${doc.year}).`);
      } else {
        failed += 1;
        console.log(`[pelosi] Ingest failed ${doc.docId}: ${result?.error || "unknown"}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`[pelosi] Error processing ${doc.docId}: ${err?.message || err}`);
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  console.log(`[pelosi] Done. Ingested: ${ingested}, skipped: ${skipped}, failed: ${failed}.`);
  await shutdownOcrWorker();
}

main().catch(err => {
  console.error(`[pelosi] Fatal: ${err?.message || err}`);
  process.exitCode = 1;
});
