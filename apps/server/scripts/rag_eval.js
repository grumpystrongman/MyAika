import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateGoldenQueries } from "../src/rag/evalHarness.js";

function resolveRepoRoot() {
  const cwd = process.cwd();
  const marker = path.join(cwd, "apps", "server");
  if (fs.existsSync(marker)) return cwd;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..");
}

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function run() {
  const repoRoot = resolveRepoRoot();
  const defaultFile = path.join(repoRoot, "apps", "server", "evals", "rag_golden.json");
  const filePath = readArg("--file") || defaultFile;
  const routed = hasFlag("--routed");
  const strict = hasFlag("--strict");
  const jsonOutput = hasFlag("--json");
  const outputFile = readArg("--output");
  const topK = Number(readArg("--topK") || "");
  const limit = Number(readArg("--limit") || "");

  const report = await evaluateGoldenQueries({
    filePath,
    routed,
    topK: Number.isFinite(topK) ? topK : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
    strict
  });

  if (outputFile) {
    fs.writeFileSync(path.resolve(outputFile), JSON.stringify(report, null, 2));
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`RAG eval report: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped.`);
    console.log(`Required queries: ${report.requiredPassed} passed, ${report.requiredFailed} failed, ${report.requiredSkipped} skipped.`);
    if (report.results.length) {
      for (const result of report.results) {
        const status = result.status || "unknown";
        const label = result.id || result.question || "query";
        const line = `${status.toUpperCase()} - ${label}`;
        console.log(line);
        if (result.failures?.length) {
          console.log(`  Failures: ${result.failures.join(", ")}`);
        }
      }
    }
  }

  if (strict) {
    if (report.required === 0) {
      console.warn("No required golden queries were scored. Add expected chunk IDs or terms to enforce regression checks.");
      process.exitCode = 2;
      return;
    }
    if (report.requiredFailed > 0) {
      process.exitCode = 1;
    }
  }
}

run().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
