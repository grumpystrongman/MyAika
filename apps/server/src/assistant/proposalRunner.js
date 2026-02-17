import { listAssistantProposals, updateAssistantProposal } from "../../storage/assistant_change_proposals.js";
import { createRagModel } from "../rag/collections.js";
import { refreshMetaRag } from "../rag/metaRag.js";

let runnerActive = false;
let runnerTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(url => String(url || "").trim())
    .filter(url => url.startsWith("http"));
}

function normalizeTopic(details, fallbackTitle) {
  if (details?.topic) return String(details.topic || "").trim();
  if (details?.name) return String(details.name || "").trim();
  const cleaned = String(fallbackTitle || "").replace(/^create rag model:\s*/i, "").trim();
  return cleaned;
}

async function applyRagCreateProposal(ownerId, proposal) {
  const details = proposal?.details || {};
  const topic = normalizeTopic(details, proposal?.title || "");
  if (!topic) throw new Error("proposal_topic_missing");
  const sources = normalizeSources(details.sources || details.sourceUrls || []);
  const description = String(details.description || "").trim();
  const autoDiscover = sources.length ? false : String(details.autoDiscover || "1") !== "0";

  try {
    const model = await createRagModel({
      topic,
      name: details.name || "",
      description,
      sources,
      autoDiscover
    });
    const decidedAt = nowIso();
    updateAssistantProposal(ownerId, proposal.id, {
      status: "implemented",
      summary: `Created RAG model "${model.title}".`,
      decidedAt,
      decidedBy: "system",
      details: {
        modelId: model.id,
        modelTitle: model.title,
        appliedAt: decidedAt
      }
    });
    await refreshMetaRag();
    return { ok: true, model };
  } catch (err) {
    const message = String(err?.message || err);
    const decidedAt = nowIso();
    if (message === "rag_model_exists") {
      updateAssistantProposal(ownerId, proposal.id, {
        status: "implemented",
        summary: `RAG model already exists for "${topic}".`,
        decidedAt,
        decidedBy: "system",
        details: { appliedAt: decidedAt, note: "model_exists" }
      });
      await refreshMetaRag();
      return { ok: true, existing: true };
    }
    updateAssistantProposal(ownerId, proposal.id, {
      status: "rejected",
      summary: `Failed to apply proposal: ${message}`,
      decidedAt,
      decidedBy: "system",
      details: { error: message, appliedAt: decidedAt }
    });
    return { ok: false, error: message };
  }
}

export async function runApprovedProposals({ ownerId = "local", limit = 50 } = {}) {
  if (runnerActive) return;
  runnerActive = true;
  try {
    const proposals = listAssistantProposals(ownerId, { status: "approved", limit });
    for (const proposal of proposals) {
      if (!proposal?.details || proposal.details.kind !== "rag_create") continue;
      await applyRagCreateProposal(ownerId, proposal);
    }
  } finally {
    runnerActive = false;
  }
}

export function startAssistantProposalLoop() {
  if (runnerTimer) return;
  const enabled = String(process.env.ASSISTANT_PROPOSAL_APPLY_ENABLED || "0") === "1";
  if (!enabled) return;
  const ownerId = String(process.env.ASSISTANT_PROPOSAL_OWNER || "local");
  const intervalMinutes = Number(process.env.ASSISTANT_PROPOSAL_APPLY_INTERVAL_MINUTES || 10);
  runApprovedProposals({ ownerId }).catch(() => {});
  if (intervalMinutes > 0) {
    runnerTimer = setInterval(() => {
      runApprovedProposals({ ownerId }).catch(() => {});
    }, Math.max(60_000, intervalMinutes * 60_000));
  }
}

