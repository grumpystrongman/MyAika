import fs from "node:fs";
import path from "node:path";
import { answerRagQuestion } from "./query.js";
import { answerRagQuestionRouted } from "./router.js";

const DEFAULT_THRESHOLDS = {
  minRecall: 0.6,
  minPrecision: 0.2,
  minTermCoverage: 0.5,
  maxMissing: 1
};

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  return [];
}

export function scoreRetrieval({ expected = {}, citations = [] } = {}) {
  const expectedIds = normalizeList(expected.chunkIds);
  const expectedTerms = normalizeList(expected.terms).map(term => term.toLowerCase());
  const retrievedIds = Array.isArray(citations)
    ? citations.map(item => String(item?.chunk_id || "").trim()).filter(Boolean)
    : [];
  const retrievedText = Array.isArray(citations)
    ? citations.map(item => String(item?.snippet || "")).join(" ").toLowerCase()
    : "";

  const idHits = expectedIds.filter(id => retrievedIds.includes(id));
  const missingIds = expectedIds.filter(id => !retrievedIds.includes(id));
  const recall = expectedIds.length ? idHits.length / expectedIds.length : null;
  const precision = retrievedIds.length ? idHits.length / retrievedIds.length : null;

  const termHits = expectedTerms.filter(term => retrievedText.includes(term));
  const termCoverage = expectedTerms.length ? termHits.length / expectedTerms.length : null;

  return {
    expectedIds,
    expectedTerms,
    retrievedIds,
    idHits,
    missingIds,
    recall,
    precision,
    termCoverage,
    termHits
  };
}

function resolveThresholds(globalThresholds = {}, localThresholds = {}) {
  return {
    minRecall: Number.isFinite(localThresholds.minRecall) ? localThresholds.minRecall : (globalThresholds.minRecall ?? DEFAULT_THRESHOLDS.minRecall),
    minPrecision: Number.isFinite(localThresholds.minPrecision) ? localThresholds.minPrecision : (globalThresholds.minPrecision ?? DEFAULT_THRESHOLDS.minPrecision),
    minTermCoverage: Number.isFinite(localThresholds.minTermCoverage) ? localThresholds.minTermCoverage : (globalThresholds.minTermCoverage ?? DEFAULT_THRESHOLDS.minTermCoverage),
    maxMissing: Number.isFinite(localThresholds.maxMissing) ? localThresholds.maxMissing : (globalThresholds.maxMissing ?? DEFAULT_THRESHOLDS.maxMissing)
  };
}

function evaluateScore(score, thresholds) {
  const failures = [];
  if (score.expectedIds.length) {
    if (score.recall !== null && score.recall < thresholds.minRecall) failures.push("minRecall");
    if (score.precision !== null && score.precision < thresholds.minPrecision) failures.push("minPrecision");
    if (score.missingIds.length > thresholds.maxMissing) failures.push("maxMissing");
  }
  if (score.expectedTerms.length) {
    if (score.termCoverage !== null && score.termCoverage < thresholds.minTermCoverage) failures.push("minTermCoverage");
  }
  return failures;
}

export async function evaluateGoldenQueries({
  filePath,
  routed = false,
  topK,
  limit,
  strict = false
} = {}) {
  if (!filePath) throw new Error("rag_eval_file_required");
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const payload = raw ? JSON.parse(raw) : {};

  const queries = Array.isArray(payload?.queries) ? payload.queries : [];
  const globalThresholds = payload?.thresholds || {};
  const results = [];

  const effectiveQueries = limit ? queries.slice(0, limit) : queries;
  for (const query of effectiveQueries) {
    if (query?.disabled || query?.skip) {
      results.push({ id: query?.id || "", status: "skipped", reason: "disabled" });
      continue;
    }
    const expected = query?.expected || {};
    const isRequired = query?.required !== false;
    const isScorable = normalizeList(expected.chunkIds).length > 0 || normalizeList(expected.terms).length > 0;
    if (!isScorable && !strict) {
      results.push({ id: query?.id || "", status: "skipped", reason: "no_expectations" });
      continue;
    }

    const question = String(query?.question || "").trim();
    if (!question) {
      results.push({ id: query?.id || "", status: "skipped", reason: "missing_question" });
      continue;
    }
    const evalTopK = Number.isFinite(query?.topK) ? query.topK : (Number.isFinite(topK) ? topK : undefined);
    const filters = query?.filters || {};
    const handler = routed ? answerRagQuestionRouted : answerRagQuestion;
    const response = await handler(question, {
      topK: evalTopK,
      filters,
      skipAnswer: true
    });
    const citations = Array.isArray(response?.citations) ? response.citations : [];
    const score = scoreRetrieval({ expected, citations });
    const thresholds = resolveThresholds(globalThresholds, query?.thresholds || {});
    const failures = evaluateScore(score, thresholds);
    const status = isScorable
      ? (failures.length ? "failed" : "passed")
      : "skipped";

    results.push({
      id: query?.id || "",
      question,
      required: isRequired,
      status,
      failures,
      thresholds,
      score: {
        recall: score.recall,
        precision: score.precision,
        termCoverage: score.termCoverage,
        missingIds: score.missingIds,
        hitIds: score.idHits,
        termHits: score.termHits
      },
      retrievedCount: citations.length
    });
  }

  const passedAll = results.filter(result => result.status === "passed").length;
  const failedAll = results.filter(result => result.status === "failed").length;
  const skippedAll = results.filter(result => result.status === "skipped").length;
  const requiredResults = results.filter(result => result.required && result.status !== "skipped");
  const requiredPassed = requiredResults.filter(result => result.status === "passed").length;
  const requiredFailed = requiredResults.filter(result => result.status === "failed").length;
  const requiredSkipped = results.filter(result => result.required && result.status === "skipped").length;

  return {
    filePath: resolved,
    routed,
    total: results.length,
    required: requiredResults.length,
    passed: passedAll,
    failed: failedAll,
    skipped: skippedAll,
    requiredPassed,
    requiredFailed,
    requiredSkipped,
    results
  };
}
