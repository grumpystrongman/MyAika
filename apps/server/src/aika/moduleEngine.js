import { executor } from "../../mcp/index.js";
import { createSafetyApproval } from "../safety/approvals.js";
import { appendAuditEvent } from "../safety/auditLog.js";
import { detectPhi } from "../safety/redact.js";
import { createModuleRun, updateModuleRun } from "../../storage/module_runs.js";
import { createRunStep, updateRunStep } from "../../storage/run_steps.js";
import { createManualAction } from "../../storage/manual_actions.js";
import { createConfirmation } from "../../storage/confirmations.js";
import { upsertMemoryItem } from "../../storage/memory_items.js";
import { listModuleRegistry, findModuleByNameOrTrigger } from "./moduleRegistry.js";
import { getSettings } from "../../storage/settings.js";
import { listRunbooks } from "./runbookEngine.js";
import { listWatchtowerItems, loadWatchTemplates } from "./watchtower.js";

function nowIso() {
  return new Date().toISOString();
}

function resolveNoIntegrations({ modeFlags } = {}) {
  if (modeFlags && modeFlags.no_integrations === true) return true;
  if (String(process.env.AIKA_NO_INTEGRATIONS || "0") === "1") return true;
  return false;
}

function getValueByPath(input, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let current = input;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function renderTemplate(value, input) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expr) => {
    const trimmed = String(expr || "").trim();
    const mapped = getValueByPath(input, trimmed);
    return mapped == null ? "" : String(mapped);
  });
}

function resolveInputMapping(mapping, input) {
  if (!mapping || typeof mapping !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(mapping)) {
    out[key] = renderTemplate(value, input);
  }
  return out;
}

function defaultChecklist(moduleDef) {
  const name = moduleDef?.name || "this module";
  return [
    `Collect inputs for ${name}.`,
    `Draft the ${name} output and validate assumptions.`,
    "Send to Jeff for confirmation or next steps."
  ];
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || "").trim()).filter(Boolean);
  }
  if (value == null) return [];
  if (typeof value === "object") {
    return Object.entries(value).map(([key, val]) => {
      if (val == null) return String(key);
      if (typeof val === "string") return `${key}: ${val}`;
      return `${key}: ${JSON.stringify(val)}`;
    });
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return raw.split(";").map(item => item.trim()).filter(Boolean);
}

function extractBulletLines(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const bullets = lines
    .filter(line => /^(\d+\.|[-*])\s+/.test(line))
    .map(line => line.replace(/^(\d+\.|[-*])\s+/, "").trim())
    .filter(Boolean);
  if (bullets.length) return bullets;
  const sentences = raw.split(/[.!?]\s+/).map(line => line.trim()).filter(Boolean);
  return sentences.slice(0, 6);
}

function formatSection(title, itemsOrText) {
  if (Array.isArray(itemsOrText)) {
    const items = itemsOrText.filter(Boolean);
    if (!items.length) return `## ${title}\n- None provided.`;
    return `## ${title}\n${items.map(item => `- ${item}`).join("\n")}`;
  }
  const text = String(itemsOrText || "").trim();
  return `## ${title}\n${text || "- None provided."}`;
}

function resolveSectionItems(structuredInput, key, fallback = []) {
  const items = normalizeList(structuredInput?.[key]);
  if (items.length) return items;
  return Array.isArray(fallback) ? fallback : normalizeList(fallback);
}

function deriveActionItems(inputPayload = {}, fallback = []) {
  const structured = inputPayload.structured_input || {};
  const direct = normalizeList(structured.action_items || structured.actions || structured.next_steps);
  if (direct.length) return direct.slice(0, 8);
  const fromContext = extractBulletLines(inputPayload.context_text || "");
  if (fromContext.length) return fromContext.slice(0, 6);
  const fallbackList = Array.isArray(fallback) ? fallback : normalizeList(fallback);
  return fallbackList.slice(0, 6);
}

function pickTopic(contextText = "", structuredInput = {}) {
  if (structuredInput?.topic) return String(structuredInput.topic).trim();
  const raw = String(contextText || "").trim();
  if (!raw) return "Topic";
  return raw.split(/\s+/).slice(0, 6).join(" ");
}

const MODULE_BLUEPRINTS = {
  content_pipeline: {
    summary: "Content pipeline drafted.",
    sections: [
      { title: "Source Content", key: "source", fallback: ["Key notes and transcripts queued"] },
      { title: "Derived Assets", key: "assets", fallback: ["Executive summary", "Email update", "One-slide brief"] },
      { title: "Distribution Plan", key: "distribution", fallback: ["Share draft with Jeff", "Collect edits", "Publish after approval"] }
    ],
    actionItems: ["Confirm target channels", "Approve final assets", "Schedule distribution"]
  },
  risk_radar: {
    summary: "Risk radar prepared.",
    sections: [
      { title: "Top Risks", key: "risks", fallback: ["Schedule slip risk", "Scope creep risk", "Data quality risk"] },
      { title: "Early Signals", key: "signals", fallback: ["Missed milestones", "Stakeholder escalations", "Rising defect rate"] },
      { title: "Mitigations", key: "mitigations", fallback: ["Replan milestones", "Clarify scope boundaries", "Increase QA sampling"] }
    ],
    actionItems: ["Assign risk owners", "Confirm mitigation timelines", "Review weekly risk changes"]
  },
  kpi_drift_anomaly_watch: {
    summary: "KPI drift watch plan prepared.",
    sections: [
      { title: "KPIs To Watch", key: "metrics", fallback: ["Delivery velocity", "Pipeline latency", "Incident count"] },
      { title: "Thresholds", key: "thresholds", fallback: ["Warn at ±10%", "Critical at ±20%"] },
      { title: "Next Checks", key: "cadence", fallback: ["Review weekly trend", "Confirm data freshness", "Notify owners on drift"] }
    ],
    actionItems: ["Confirm KPI list", "Set alert thresholds", "Choose notification channel"]
  },
  quality_consistency_checker: {
    summary: "Quality consistency check prepared.",
    sections: [
      { title: "Potential Conflicts", key: "conflicts", fallback: ["Metric definitions differ between sources", "Mismatched date ranges", "Inconsistent totals"] },
      { title: "Reconciliation Plan", key: "plan", fallback: ["Align definitions", "Normalize time windows", "Recompute aggregates"] }
    ],
    actionItems: ["Validate source definitions", "Approve reconciliation plan"]
  },
  vendor_evaluation_assistant: {
    summary: "Vendor evaluation drafted.",
    sections: [
      { title: "Criteria", key: "criteria", fallback: ["Cost", "Security posture", "Integration effort"] },
      { title: "Scorecard", key: "scorecard", fallback: ["Vendor A: 8/10", "Vendor B: 7/10"] },
      { title: "Recommendation", key: "recommendation", fallback: ["Proceed with Vendor A pending security review"] }
    ],
    actionItems: ["Confirm evaluation criteria", "Review scorecard with stakeholders"]
  },
  portfolio_orchestrator: {
    summary: "Portfolio priorities drafted.",
    sections: [
      { title: "Initiatives", key: "initiatives", fallback: ["Data quality program", "Self-service BI rollout", "Pipeline modernization"] },
      { title: "Prioritization", key: "prioritization", fallback: ["Score by impact/effort", "Defer low leverage items"] },
      { title: "Roadmap", key: "roadmap", fallback: ["0-30 days: align", "31-90 days: execute", "90+ days: optimize"] }
    ],
    actionItems: ["Confirm ranking criteria", "Approve roadmap sequencing"]
  },
  meeting_architecture: {
    summary: "Meeting architecture proposal prepared.",
    sections: [
      { title: "Current Cadence", key: "current", fallback: ["Weekly staff meeting", "Biweekly leadership sync"] },
      { title: "Proposed Cadence", key: "proposed", fallback: ["Reduce status meetings", "Introduce async updates", "Consolidate decision forums"] },
      { title: "Decisions Needed", key: "decisions", fallback: ["Confirm owners", "Set pilot duration"] }
    ],
    actionItems: ["Validate cadence changes with stakeholders", "Pilot new schedule for 30 days"]
  },
  org_load_balancer: {
    summary: "Org load balance snapshot prepared.",
    sections: [
      { title: "Load Hotspots", key: "hotspots", fallback: ["Analytics backlog in Platform team", "High support load in BI Ops"] },
      { title: "Rebalancing Plan", key: "plan", fallback: ["Shift low-priority work", "Add rotation coverage", "Defer non-critical projects"] },
      { title: "Asks", key: "asks", fallback: ["Approve temp contractor", "Reprioritize roadmap"] }
    ],
    actionItems: ["Confirm resourcing changes", "Communicate updated priorities"]
  },
  narrative_influence_builder: {
    summary: "Executive narrative drafted.",
    sections: [
      { title: "Narrative", key: "narrative", fallback: ["We are accelerating insight delivery while reducing operational risk."] },
      { title: "Key Messages", key: "messages", fallback: ["Clear wins", "Roadmap confidence", "Risk mitigation"] },
      { title: "Q&A Prep", key: "qa", fallback: ["What changed?", "Why now?", "How success is measured?"] }
    ],
    actionItems: ["Review narrative tone", "Finalize Q&A list"]
  },
  policy_governance_builder: {
    summary: "Policy & governance framework drafted.",
    sections: [
      { title: "Governance Model", key: "model", fallback: ["Intake → Review → Decision → Enforcement"] },
      { title: "RACI", key: "raci", fallback: ["R: Ops lead", "A: Jeff", "C: Security", "I: Stakeholders"] },
      { title: "Decision Rights", key: "rights", fallback: ["Define escalation paths and approval thresholds"] }
    ],
    actionItems: ["Validate decision rights", "Publish governance doc"]
  },
  personal_performance_engine: {
    summary: "Personal performance plan drafted.",
    sections: [
      { title: "Weekly Focus", key: "focus", fallback: ["Two deep work blocks", "Leadership 1:1s", "Key stakeholder updates"] },
      { title: "Time Blocks", key: "blocks", fallback: ["Mon/Wed AM focus", "Tue PM strategic planning"] },
      { title: "Experiments", key: "experiments", fallback: ["Reduce meetings by 20%", "Batch inbox triage"] }
    ],
    actionItems: ["Confirm focus blocks", "Review after 2 weeks"]
  },
  mission_mode: {
    summary: "Mission plan drafted.",
    sections: [
      { title: "Objective", key: "objective", fallback: ["Deliver the requested outcome with milestones and guardrails"] },
      { title: "Milestones", key: "milestones", fallback: ["Discovery", "Execution", "Delivery"] },
      { title: "Risks", key: "risks", fallback: ["Dependency delays", "Resource constraints"] }
    ],
    actionItems: ["Confirm mission scope", "Approve milestone timeline"]
  },
  delegation_simulator: {
    summary: "Delegation plan prepared.",
    sections: [
      { title: "Candidate Delegates", key: "candidates", fallback: ["Ops lead", "Senior analyst"] },
      { title: "Rationale", key: "rationale", fallback: ["Skill match", "Capacity available", "Growth opportunity"] },
      { title: "Draft Message", key: "message", fallback: ["Draft a clear handoff note with expectations."] }
    ],
    actionItems: ["Select delegate", "Send handoff message"]
  },
  incident_commander: {
    summary: "Incident command outline prepared.",
    sections: [
      { title: "Situation Summary", key: "summary", fallback: ["Incident impact, scope, and current status"] },
      { title: "Timeline", key: "timeline", fallback: ["T+0 detect", "T+15 mitigate", "T+60 stabilize"] },
      { title: "Stakeholder Updates", key: "updates", fallback: ["Customer update drafted", "Leadership brief queued"] }
    ],
    actionItems: ["Confirm incident severity", "Send first update", "Schedule postmortem"]
  },
  executive_digital_twin: {
    summary: "Advisory twin response drafted.",
    sections: [
      { title: "Recommendation", key: "recommendation", fallback: ["Prioritize clarity and speed; align stakeholders early."] },
      { title: "Reasoning", key: "reasoning", fallback: ["Focus on leverage, risk reduction, and measurable outcomes."] },
      { title: "Script", key: "script", fallback: ["Draft a crisp message with decision framing."] }
    ],
    actionItems: ["Confirm decision framing", "Approve script tone"]
  },
  counterfactual_engine: {
    summary: "Counterfactual scenarios drafted.",
    sections: [
      { title: "30-Day Scenario", key: "day_30", fallback: ["Near-term impacts, leading indicators, and quick wins."] },
      { title: "60-Day Scenario", key: "day_60", fallback: ["Mid-term outcomes with dependency watchpoints."] },
      { title: "90-Day Scenario", key: "day_90", fallback: ["Longer-term trajectory and risk inflection points."] }
    ],
    actionItems: ["Validate assumptions", "Select preferred scenario"]
  },
  second_order_effects_mapper: {
    summary: "Second-order effects map prepared.",
    sections: [
      { title: "First-Order Effects", key: "first_order", fallback: ["Immediate operational changes"] },
      { title: "Second-Order Effects", key: "second_order", fallback: ["Downstream stakeholder impacts", "Process shifts"] },
      { title: "Mitigations", key: "mitigations", fallback: ["Communications plan", "Guardrails for unintended effects"] }
    ],
    actionItems: ["Review downstream impacts", "Agree on mitigations"]
  },
  strategy_lab: {
    summary: "Strategy slate drafted.",
    sections: [
      { title: "Bold Strategy", key: "bold", fallback: ["Aggressive growth and automation push"] },
      { title: "Conservative Strategy", key: "conservative", fallback: ["Stability-first with incremental gains"] },
      { title: "Hybrid Strategy", key: "hybrid", fallback: ["Balanced execution with selective bets"] },
      { title: "Failure Modes", key: "failure_modes", fallback: ["Execution risk", "Stakeholder misalignment"] }
    ],
    actionItems: ["Select preferred strategy", "Stress-test assumptions"]
  },
  negotiation_architect: {
    summary: "Negotiation plan drafted.",
    sections: [
      { title: "Goals & BATNA", key: "batna", fallback: ["Define target outcome and walk-away option"] },
      { title: "Concessions Ladder", key: "concessions", fallback: ["List acceptable trade-offs by priority"] },
      { title: "Talk Track", key: "talk_track", fallback: ["Opening position and value framing"] }
    ],
    actionItems: ["Confirm red lines", "Rehearse talk track"]
  },
  org_politics_map: {
    summary: "Org incentives map drafted.",
    sections: [
      { title: "Stakeholders", key: "stakeholders", fallback: ["Executives", "Ops leads", "Partner teams"] },
      { title: "Incentives", key: "incentives", fallback: ["Speed", "Cost containment", "Reliability"] },
      { title: "Ethical Influence", key: "influence", fallback: ["Align narratives to shared goals"] }
    ],
    actionItems: ["Validate stakeholder incentives", "Plan outreach sequence"]
  },
  continuous_improvement_flywheel: {
    summary: "Automation upgrade backlog drafted.",
    sections: [
      { title: "Top Upgrades", key: "upgrades", fallback: ["Auto KPI digest", "Inbox triage automation", "Meeting prep packets"] },
      { title: "Estimated Time Saved", key: "time_saved", fallback: ["2-4 hrs/week", "1-2 hrs/week"] },
      { title: "Next Steps", key: "next_steps", fallback: ["Select top 2 upgrades", "Schedule implementation"] }
    ],
    actionItems: ["Pick top upgrades", "Assign owners and timelines"]
  },
  personal_legacy_planner: {
    summary: "Legacy roadmap drafted.",
    sections: [
      { title: "12-Month Roadmap", key: "roadmap", fallback: ["Leadership visibility", "Strategic initiatives", "Mentorship"] },
      { title: "Skill Compounding", key: "skills", fallback: ["Executive storytelling", "Org design", "Advanced analytics"] },
      { title: "Milestones", key: "milestones", fallback: ["Quarterly progress reviews", "VP readiness checkpoints"] }
    ],
    actionItems: ["Confirm milestones", "Plan quarterly check-ins"]
  }
};

function buildBlueprintOutput(moduleDef, inputPayload = {}) {
  const blueprint = MODULE_BLUEPRINTS[moduleDef?.id];
  if (!blueprint) return null;
  const contextText = String(inputPayload.context_text || "").trim();
  const structured = inputPayload.structured_input || {};
  const sections = [];
  if (contextText) sections.push(formatSection("Context", [contextText]));
  for (const section of blueprint.sections || []) {
    const items = resolveSectionItems(structured, section.key, section.fallback);
    sections.push(formatSection(section.title, items));
  }
  const actionItems = deriveActionItems(inputPayload, blueprint.actionItems || []);
  if (actionItems.length) sections.push(formatSection("Next Actions", actionItems));
  return {
    summary: blueprint.summary || `${moduleDef?.name || "Module"} output prepared.`,
    details: sections.join("\n\n"),
    action_items: actionItems,
    artifacts: blueprint.artifacts || {}
  };
}

function buildTemplateEngineOutput(moduleDef, inputPayload = {}) {
  const contextText = String(inputPayload.context_text || "").trim();
  const structured = inputPayload.structured_input || {};
  const topic = pickTopic(contextText, structured);
  const rawType = String(structured.template || structured.type || contextText).toLowerCase();
  let templateType = "status";
  if (rawType.includes("sop")) templateType = "sop";
  else if (rawType.includes("charter")) templateType = "charter";
  else if (rawType.includes("score")) templateType = "scorecard";
  else if (rawType.includes("status")) templateType = "status";

  let details = "";
  if (templateType === "sop") {
    details = `# SOP: ${topic}\n\n## Purpose\n- \n\n## Scope\n- \n\n## Steps\n1. \n2. \n3. \n\n## Owners\n- \n\n## Metrics\n- `;
  } else if (templateType === "charter") {
    details = `# Project Charter: ${topic}\n\n## Objective\n- \n\n## Success Criteria\n- \n\n## Stakeholders\n- \n\n## Timeline\n- \n\n## Risks\n- `;
  } else if (templateType === "scorecard") {
    details = `# Scorecard: ${topic}\n\n## Criteria\n- \n\n## Scores\n- \n\n## Recommendation\n- `;
  } else {
    details = `# Status Report: ${topic}\n\n## Summary\n- \n\n## This Week\n- \n\n## Risks/Blocks\n- \n\n## Next Week\n- `;
  }

  const actionItems = deriveActionItems(inputPayload, ["Fill template placeholders", "Review with stakeholders", "Finalize and distribute"]);
  return {
    summary: `${moduleDef?.name || "Template"} drafted (${templateType}).`,
    details,
    action_items: actionItems
  };
}

function buildRunbookOutput(moduleDef, inputPayload = {}) {
  const runbooks = listRunbooks() || [];
  const contextText = String(inputPayload.context_text || "").trim();
  const runbookLines = runbooks.map(rb => `${rb.name}${rb.description ? ` — ${rb.description}` : ""}`);
  const sections = [];
  if (contextText) sections.push(formatSection("Context", [contextText]));
  sections.push(formatSection("Available Runbooks", runbookLines.length ? runbookLines : ["No runbooks available."]));
  const actionItems = deriveActionItems(inputPayload, ["Select a runbook", "Provide required inputs", "Run the workflow"]);
  sections.push(formatSection("Next Actions", actionItems));
  return {
    summary: "Runbook catalog ready.",
    details: sections.join("\n\n"),
    action_items: actionItems,
    artifacts: { runbooks }
  };
}

function buildWatchtowerOutput(moduleDef, inputPayload = {}) {
  const items = listWatchtowerItems({ userId: "local", enabledOnly: false });
  const templates = loadWatchTemplates();
  const sections = [];
  if (items.length) {
    sections.push(formatSection("Active Watches", items.map(item => `${item.type} (${item.enabled ? "on" : "off"})`)));
  } else {
    sections.push(formatSection("Active Watches", ["No watch items configured."]));
  }
  sections.push(formatSection("Available Templates", (templates || []).map(t => `${t.name || t.id}`)));
  const actionItems = deriveActionItems(inputPayload, ["Add a watch template", "Define thresholds", "Set notification cadence"]);
  sections.push(formatSection("Next Actions", actionItems));
  return {
    summary: "Watchtower overview prepared.",
    details: sections.join("\n\n"),
    action_items: actionItems,
    artifacts: { items, templates }
  };
}

function buildDecisionBrief(input = {}) {
  const options = Array.isArray(input?.options) ? input.options : [];
  const criteria = Array.isArray(input?.criteria) ? input.criteria : [];
  const recommendation = options[0] ? `Recommend ${options[0]}.` : "Recommend the strongest option based on criteria.";
  const pros = options[0] ? `Pros: aligns with ${criteria[0] || "priority outcomes"}.` : "Pros: aligns with priorities.";
  const cons = options[1] ? `Cons: ${options[1]} may introduce tradeoffs.` : "Cons: tradeoffs require validation.";
  const risks = "Risks: dependency timing and stakeholder alignment.";
  const choices = options.length ? options.slice(0, 3).map(item => `- ${item}`).join("\n") : "- Option A\n- Option B";
  return [
    recommendation,
    `- ${pros}`,
    `- ${cons}`,
    `- ${risks}`,
    "Options:",
    choices,
    "What I need from Jeff: confirm preferred option or provide missing constraints."
  ].join("\n");
}

function buildAnalysisOutput(moduleDef, inputPayload = {}) {
  if (!moduleDef) return { summary: "Module not found.", details: "" };
  const contextText = String(inputPayload.context_text || "").trim();
  const baseSummary = contextText
    ? `${moduleDef.name}: processed request "${contextText.slice(0, 120)}${contextText.length > 120 ? "..." : ""}".`
    : `${moduleDef.name}: prepared initial analysis.`;
  if (moduleDef.id === "decision_brief_generator") {
    const actionItems = deriveActionItems(inputPayload, ["Confirm preferred option", "Provide missing constraints"]);
    return {
      summary: "Decision brief drafted.",
      details: buildDecisionBrief(inputPayload.structured_input || {}),
      action_items: actionItems
    };
  }
  if (moduleDef.id === "multi_step_runbooks") {
    return buildRunbookOutput(moduleDef, inputPayload);
  }
  if (moduleDef.id === "watchtower_mode") {
    return buildWatchtowerOutput(moduleDef, inputPayload);
  }
  if (moduleDef.id === "template_engine") {
    return buildTemplateEngineOutput(moduleDef, inputPayload);
  }
  const blueprintOutput = buildBlueprintOutput(moduleDef, inputPayload);
  if (blueprintOutput) return blueprintOutput;
  const actionItems = deriveActionItems(inputPayload, []);
  return {
    summary: baseSummary,
    details: moduleDef.description || "",
    action_items: actionItems
  };
}

function sanitizeMemoryPayload(payload = {}) {
  const text = JSON.stringify(payload);
  if (detectPhi(text)) {
    return { blocked: true, reason: "phi_detected" };
  }
  return { blocked: false };
}

function isIntegrationError(err) {
  const message = String(err?.message || "").toLowerCase();
  if (!message) return false;
  if (message.includes("policy_")) return false;
  const markers = [
    "not_connected",
    "not_configured",
    "oauth",
    "refresh_token_missing",
    "token_missing",
    "tenant_missing",
    "domain_missing",
    "calendar",
    "gmail",
    "microsoft",
    "outlook",
    "slack",
    "discord",
    "telegram"
  ];
  return markers.some(marker => message.includes(marker));
}

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function resolveMissingToolInputs(toolName, params = {}) {
  if (!toolName) return null;
  const missing = [];
  if (toolName === "calendar.proposeHold") {
    if (isEmptyValue(params.title)) missing.push("title");
    if (isEmptyValue(params.start)) missing.push("start");
    if (isEmptyValue(params.end)) missing.push("end");
    if (isEmptyValue(params.timezone)) missing.push("timezone");
  }
  if (toolName === "todos.create") {
    if (isEmptyValue(params.title)) missing.push("title");
  }
  if (toolName === "meeting.summarize") {
    if (isEmptyValue(params.transcript)) missing.push("transcript");
  }
  if (toolName === "notes.create") {
    if (isEmptyValue(params.title)) missing.push("title");
    if (isEmptyValue(params.body) && isEmptyValue(params.content)) missing.push("body");
  }
  if (toolName === "memory.write") {
    if (isEmptyValue(params.title)) missing.push("title");
    if (isEmptyValue(params.content)) missing.push("content");
  }
  if (toolName === "messaging.telegramSend") {
    if (isEmptyValue(params.chatId)) missing.push("chatId");
    if (isEmptyValue(params.message)) missing.push("message");
  }
  if (toolName === "email.draftReply") {
    if (isEmptyValue(params.originalEmail) && isEmptyValue(params.context)) missing.push("originalEmail");
  }
  if (toolName === "email.send") {
    const hasDraft = !isEmptyValue(params.draftId);
    const hasBody = !isEmptyValue(params.body);
    const hasRecipients = !isEmptyValue(params.sendTo) || !isEmptyValue(params.to);
    if (!hasDraft && !(hasBody && hasRecipients)) missing.push("draftId_or_body_and_to");
  }
  if (toolName === "email.sendWithContext") {
    if (isEmptyValue(params.email)) missing.push("email");
  }
  return missing.length ? missing : null;
}

async function runToolStep(step, inputPayload, context = {}, options = {}) {
  const toolName = step.tool_name || step.toolName;
  if (!toolName) return { status: "skipped", result: { error: "tool_missing" } };
  const params = options.params ?? resolveInputMapping(step.input_mapping || step.inputMapping || {}, inputPayload);
  const executionContext = {
    userId: context.userId || "local",
    source: context.source || "aika_module"
  };
  const result = await (options.toolExecutor || executor).callTool({
    name: toolName,
    params,
    context: executionContext
  });
  return result;
}

function augmentOutputFromTool({ moduleDef, toolName, result, output }) {
  if (!toolName || !output) return;
  if (toolName === "email.inboxTriage") {
    const payload = result?.data || result || {};
    const summary = payload.summary || {};
    const total = Number(summary.total || payload.items?.length || 0);
    const urgent = Number(summary.urgent || 0);
    const normal = Number(summary.normal || 0);
    const low = Number(summary.low || 0);
    const top = Array.isArray(payload.top) ? payload.top : Array.isArray(payload.items) ? payload.items : [];
    const topLines = top.slice(0, 5).map(item => {
      const category = item.category || "normal";
      const subject = item.subject || "No subject";
      const from = item.from || "Unknown sender";
      const action = item.suggestedAction || "review";
      return `[${category}] ${subject} — ${from} (${action})`;
    });
    output.summary = `Inbox triage: ${total} messages (${urgent} urgent).`;
    output.details = [
      formatSection("Triage Summary", [
        `Total: ${total}`,
        `Urgent: ${urgent}`,
        `Normal: ${normal}`,
        `Low: ${low}`
      ]),
      formatSection("Top Messages", topLines.length ? topLines : ["No messages returned."])
    ].join("\n\n");
    const urgentItems = top.filter(item => item.category === "urgent").map(item => `Reply: ${item.subject || "urgent message"}`);
    output.action_items = urgentItems.length ? urgentItems : ["Review top messages", "Mark urgent replies"];
  }
}

function createManualChecklistAction({ moduleDef, runId, checklist, userId }) {
  const instructions = Array.isArray(checklist) ? checklist.join("\n") : String(checklist || "");
  return createManualAction({
    userId,
    sourceRunId: runId,
    priority: "medium",
    title: `${moduleDef?.name || "Module"} manual steps`,
    instructions,
    copyReadyPayload: {
      moduleId: moduleDef?.id || "",
      checklist: Array.isArray(checklist) ? checklist : []
    },
    status: "pending"
  });
}

function createStepConfirmation({ moduleDef, step, runId, userId }) {
  const summary = `${moduleDef?.name || "Module"} requires confirmation for ${step.name || "action"}.`;
  const approval = createSafetyApproval({
    actionType: step.tool_name || step.toolName || moduleDef?.id || "module.confirmation",
    summary,
    payloadRedacted: { moduleId: moduleDef?.id || "", step: step.name || "" },
    createdBy: userId || "local"
  });
  const confirmation = createConfirmation({
    userId,
    runId,
    actionType: step.tool_name || step.toolName || moduleDef?.id || "module.confirmation",
    summary,
    details: { moduleId: moduleDef?.id || "", step: step.name || "" },
    status: "pending",
    approvalId: approval?.id || ""
  });
  return { approval, confirmation };
}

export async function executeModule({
  moduleId,
  moduleName,
  inputPayload = {},
  context = {},
  modeFlags = null,
  toolExecutor = null
} = {}) {
  const modules = listModuleRegistry({ includeDisabled: true });
  const moduleDef = moduleId
    ? modules.find(m => m.id === moduleId)
    : findModuleByNameOrTrigger(moduleName || "", modules);
  if (!moduleDef) {
    return { status: "error", error: "module_not_found", reply: "I couldn't find that module." };
  }

  const settings = getSettings(context.userId || "local");
  const noIntegrations = resolveNoIntegrations({ modeFlags: modeFlags || settings.modeFlags })
    || inputPayload?.options?.no_integrations === true;
  const run = createModuleRun({
    userId: context.userId || "local",
    moduleId: moduleDef.id,
    channel: context.channel || "",
    status: "running",
    inputPayload
  });

  const output = {
    summary: "",
    details: "",
    action_items: [],
    manual_checklist: [],
    artifacts: {}
  };

  let runStatus = "completed";
  let approval = null;
  let autoStepCompleted = false;
  let manualChecklistCreated = false;
  let manualFallback = false;

  const steps = Array.isArray(moduleDef.actionDefinition?.steps)
    ? moduleDef.actionDefinition.steps
    : Array.isArray(moduleDef.action_definition?.steps)
      ? moduleDef.action_definition.steps
      : [];
  const hasToolSteps = steps.some(step => ["tool_call", "notify", "confirmation"].includes(step?.step_type));

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index] || {};
    const stepRecord = createRunStep({
      moduleRunId: run.id,
      stepIndex: index,
      stepType: step.step_type || "",
      status: "running",
      request: step
    });
    try {
      if (step.step_type === "analysis") {
        const analysis = buildAnalysisOutput(moduleDef, inputPayload);
        output.summary = output.summary || analysis.summary;
        output.details = output.details || analysis.details;
        if (analysis.action_items && !output.action_items.length) {
          output.action_items = analysis.action_items;
        }
        if (analysis.artifacts) {
          output.artifacts = { ...output.artifacts, ...analysis.artifacts };
        }
        if (!hasToolSteps && !noIntegrations) {
          autoStepCompleted = true;
        }
        updateRunStep(stepRecord.id, { status: "completed", response: analysis, endedAt: nowIso() });
        continue;
      }

      if (step.step_type === "manual") {
        if (manualChecklistCreated) {
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "manual_already_created" }, endedAt: nowIso() });
          continue;
        }
        if (step.on_no_integration === "manual_checklist" && !noIntegrations && autoStepCompleted && !manualFallback) {
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "auto_completed" }, endedAt: nowIso() });
          continue;
        }
        const checklist = moduleDef.templates?.manual_checklist || defaultChecklist(moduleDef);
        output.manual_checklist = checklist;
        createManualChecklistAction({
          moduleDef,
          runId: run.id,
          checklist,
          userId: context.userId || "local"
        });
        manualChecklistCreated = true;
        updateRunStep(stepRecord.id, { status: "completed", response: { checklist }, endedAt: nowIso() });
        continue;
      }

      if (step.step_type === "confirmation") {
        const confirmation = createStepConfirmation({
          moduleDef,
          step,
          runId: run.id,
          userId: context.userId || "local"
        });
        approval = confirmation.approval;
        runStatus = "approval_required";
        updateRunStep(stepRecord.id, {
          status: "approval_required",
          response: { approval: confirmation.approval, confirmation: confirmation.confirmation },
          endedAt: nowIso()
        });
        break;
      }

      if (step.step_type === "notify") {
        if (noIntegrations) {
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "no_integrations" }, endedAt: nowIso() });
          continue;
        }
        const toolName = step.tool_name || step.toolName || "";
        const params = resolveInputMapping(step.input_mapping || step.inputMapping || {}, inputPayload);
        const missing = resolveMissingToolInputs(toolName, params);
        if (missing) {
          manualFallback = true;
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "missing_inputs", missing }, endedAt: nowIso() });
          continue;
        }
        let result;
        try {
          result = await runToolStep(step, inputPayload, context, { toolExecutor, params });
        } catch (err) {
          if (step.on_no_integration === "manual_checklist" && isIntegrationError(err)) {
            const checklist = moduleDef.templates?.manual_checklist || defaultChecklist(moduleDef);
            output.manual_checklist = checklist;
            createManualChecklistAction({
              moduleDef,
              runId: run.id,
              checklist,
              userId: context.userId || "local"
            });
            manualChecklistCreated = true;
            manualFallback = true;
            updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "integration_missing" }, endedAt: nowIso() });
            continue;
          }
          runStatus = "error";
          updateRunStep(stepRecord.id, { status: "error", response: { error: err?.message || "step_failed" }, endedAt: nowIso() });
          break;
        }
        if (result?.status === "approval_required") {
          approval = result.approval || null;
          runStatus = "approval_required";
          updateRunStep(stepRecord.id, { status: "approval_required", response: result, endedAt: nowIso() });
          break;
        }
        augmentOutputFromTool({ moduleDef, toolName, result, output });
        updateRunStep(stepRecord.id, { status: "completed", response: result, endedAt: nowIso() });
        output.artifacts[step.output_key || `step_${index}`] = result?.data || result;
        autoStepCompleted = true;
        continue;
      }

      if (step.step_type === "tool_call") {
        if (noIntegrations) {
          const checklist = moduleDef.templates?.manual_checklist || defaultChecklist(moduleDef);
          output.manual_checklist = checklist;
          createManualChecklistAction({
            moduleDef,
            runId: run.id,
            checklist,
            userId: context.userId || "local"
          });
          manualChecklistCreated = true;
          manualFallback = true;
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "no_integrations" }, endedAt: nowIso() });
          continue;
        }

        const resolvedToolName = step.tool_name || step.toolName || "";
        const params = resolveInputMapping(step.input_mapping || step.inputMapping || {}, inputPayload);
        const missing = resolveMissingToolInputs(resolvedToolName, params);
        if (missing) {
          manualFallback = true;
          updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "missing_inputs", missing }, endedAt: nowIso() });
          continue;
        }

        if (step.requires_confirmation || moduleDef.requiresConfirmation) {
          const confirmation = createStepConfirmation({
            moduleDef,
            step,
            runId: run.id,
            userId: context.userId || "local"
          });
          approval = confirmation.approval;
          runStatus = "approval_required";
          updateRunStep(stepRecord.id, {
            status: "approval_required",
            response: { approval: confirmation.approval, confirmation: confirmation.confirmation },
            endedAt: nowIso()
          });
          break;
        }

        let result;
        try {
          result = await runToolStep(step, inputPayload, context, { toolExecutor, params });
        } catch (err) {
          if (step.on_no_integration === "manual_checklist" && isIntegrationError(err)) {
            const checklist = moduleDef.templates?.manual_checklist || defaultChecklist(moduleDef);
            output.manual_checklist = checklist;
            createManualChecklistAction({
              moduleDef,
              runId: run.id,
              checklist,
              userId: context.userId || "local"
            });
            manualChecklistCreated = true;
            manualFallback = true;
            updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "integration_missing" }, endedAt: nowIso() });
            continue;
          }
          runStatus = "error";
          updateRunStep(stepRecord.id, { status: "error", response: { error: err?.message || "step_failed" }, endedAt: nowIso() });
          break;
        }
        if (result?.status === "approval_required") {
          approval = result.approval || null;
          runStatus = "approval_required";
          updateRunStep(stepRecord.id, { status: "approval_required", response: result, endedAt: nowIso() });
          break;
        }
        if (result?.status === "error") {
          runStatus = "error";
          updateRunStep(stepRecord.id, { status: "error", response: result, endedAt: nowIso() });
          break;
        }
        if (resolvedToolName === "memory.write") {
          const sanitized = sanitizeMemoryPayload(result?.data || {});
          const sensitivity = inputPayload?.structured_input?.sensitivity || "normal";
          if (sensitivity === "do_not_store") {
            runStatus = "partial";
            updateRunStep(stepRecord.id, { status: "blocked", response: { reason: "do_not_store" }, endedAt: nowIso() });
          } else if (sanitized.blocked) {
            runStatus = "partial";
            updateRunStep(stepRecord.id, { status: "blocked", response: { reason: sanitized.reason }, endedAt: nowIso() });
          } else if (inputPayload?.structured_input?.key) {
            upsertMemoryItem({
              userId: context.userId || "local",
              scope: "memory",
              key: String(inputPayload.structured_input.key),
              value: inputPayload.structured_input.value || {},
              sensitivity,
              source: "module"
            });
          }
        }
        augmentOutputFromTool({ moduleDef, toolName: resolvedToolName, result, output });
        updateRunStep(stepRecord.id, { status: "completed", response: result, endedAt: nowIso() });
        output.artifacts[step.output_key || `step_${index}`] = result?.data || result;
        autoStepCompleted = true;
        continue;
      }

      updateRunStep(stepRecord.id, { status: "skipped", response: { reason: "unsupported_step" }, endedAt: nowIso() });
    } catch (err) {
      runStatus = "error";
      updateRunStep(stepRecord.id, { status: "error", response: { error: err?.message || "step_failed" }, endedAt: nowIso() });
      break;
    }
  }

  const completedAt = runStatus === "completed" ? nowIso() : null;
  updateModuleRun(run.id, { status: runStatus, outputPayload: output, completedAt });
  appendAuditEvent({
    action_type: "module.run",
    decision: runStatus,
    reason: moduleDef.id,
    user: context.userId || "local",
    session: context.sessionId || "",
    redacted_payload: { moduleId: moduleDef.id },
    result_redacted: { status: runStatus }
  });

  return {
    status: runStatus,
    run,
    output,
    approval
  };
}
