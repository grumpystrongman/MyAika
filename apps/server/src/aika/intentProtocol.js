import { readConfig } from "./config.js";

const OPERATING_MODEL_FILE = "aika_operating_model.json";

const INTENT_PATTERNS = [
  { intent: "AUTOPILOT", patterns: [/^autopilot\b/i, /\bhandle .+ going forward\b/i] },
  { intent: "STAGE", patterns: [/^stage\b/i, /^prepare but don't execute\b/i, /^prepare but do not execute\b/i] },
  { intent: "SIMULATE", patterns: [/^simulate\b/i, /^what happens if\b/i] },
  { intent: "OPTIMIZE", patterns: [/^optimi[sz]e\b/i, /^improve\b/i] },
  { intent: "MONITOR", patterns: [/^monitor\b/i, /^watch\b/i] },
  { intent: "BUILD", patterns: [/^build\b/i, /^create\b/i] },
  { intent: "CONTROL", patterns: [/^control\b/i, /^open\b/i, /^click\b/i, /^navigate\b/i, /^run\b/i] },
  { intent: "ANALYZE", patterns: [/^analy[sz]e\b/i, /^figure out\b/i] },
  { intent: "PREPARE", patterns: [/^prepare\b/i, /^get .+ ready\b/i] },
  { intent: "EXECUTE", patterns: [/^execute\b/i, /^do\b/i] }
];

const INTENT_TO_MODULE = {
  EXECUTE: "mission_mode",
  PREPARE: "meeting_packets",
  ANALYZE: "decision_brief_generator",
  CONTROL: "cross_channel_router",
  BUILD: "multi_step_runbooks",
  MONITOR: "watchtower_mode",
  OPTIMIZE: "continuous_improvement_flywheel",
  SIMULATE: "counterfactual_engine",
  STAGE: "drafting_factory",
  AUTOPILOT: "watchtower_mode"
};

const APPROVAL_REQUIRED_PATTERNS = [
  /\binstall\b/i,
  /\bupdate package\b/i,
  /\bdelete\b/i,
  /\boverwrite\b/i,
  /\blogin\b/i,
  /\bpassword\b/i,
  /\bapi key\b/i,
  /\btoken\b/i,
  /\bsend\b/i,
  /\bpublish\b/i,
  /\bgit push\b/i,
  /\bdeploy\b/i,
  /\bdocker\b/i,
  /\bcontainer\b/i,
  /\bexport\b/i
];

const NEVER_PATTERNS = [
  /\bstealth\b/i,
  /\bbypass\b/i,
  /\bdisable safeguards\b/i,
  /\bhidden persistence\b/i,
  /\bsecret extraction\b/i
];

function normalize(text) {
  return String(text || "").trim();
}

export function stripAikaPrefix(text) {
  const trimmed = normalize(text);
  if (!trimmed) return "";
  const match = trimmed.match(/^aika(?:[\s,:-]+)(.+)$/i);
  return match ? match[1].trim() : trimmed;
}

function normalizeLower(text) {
  return normalize(text).toLowerCase();
}

function detectIntent(cleanedText = "") {
  for (const item of INTENT_PATTERNS) {
    for (const pattern of item.patterns) {
      if (pattern.test(cleanedText)) {
        return item.intent;
      }
    }
  }
  return null;
}

function classifyLane(cleanedText = "", intent = "") {
  const text = normalizeLower(cleanedText);
  if (/\b(trace|evaluation|eval|token|cost|observe|observability)\b/.test(text)) {
    return { lane: "observability", system: "Opik", reason: "Monitoring and evaluation signal detected." };
  }
  if (/\b(desktop|window|mouse|keyboard|clipboard|gui|vm|sandbox)\b/.test(text)) {
    return { lane: "desktop", system: "CUA", reason: "Desktop/GUI control signal detected." };
  }
  if (/\b(workflow|multi-step browser|form workflow|long browser)\b/.test(text)) {
    return { lane: "workflow_web", system: "Skyvern", reason: "Complex browser workflow signal detected." };
  }
  if (/\b(browser|website|open site|navigate|click|scrape|extract)\b/.test(text) || intent === "CONTROL") {
    return { lane: "deterministic_web", system: "agent-browser", reason: "Deterministic browser action signal detected." };
  }
  if (/\b(code|repo|script|patch|test|node|npm|dockerfile)\b/.test(text) || intent === "BUILD") {
    return { lane: "code", system: "Codex + MCP", reason: "Engineering execution signal detected." };
  }
  if (intent === "AUTOPILOT" || intent === "MONITOR") {
    return { lane: "orchestration", system: "OpenClaw", reason: "Persistent workflow orchestration requested." };
  }
  return { lane: "code", system: "Codex + MCP", reason: "Defaulting to engineering execution lane." };
}

function detectRisk(text = "") {
  const matchedNever = NEVER_PATTERNS.find(pattern => pattern.test(text));
  if (matchedNever) {
    return {
      level: "prohibited",
      approvalRequired: true,
      reason: "Request matches prohibited safety pattern."
    };
  }
  const matchedApproval = APPROVAL_REQUIRED_PATTERNS.find(pattern => pattern.test(text));
  if (matchedApproval) {
    return {
      level: "approval_required",
      approvalRequired: true,
      reason: "Request includes a high-impact action requiring approval."
    };
  }
  return {
    level: "auto",
    approvalRequired: false,
    reason: "Low-risk reversible request."
  };
}

function parseGoal(cleanedText = "", intent = "") {
  const lowered = normalize(cleanedText);
  const lead = lowered.replace(/^(execute|prepare|analy[sz]e|control|build|monitor|optimi[sz]e|simulate|stage|autopilot)\s*/i, "");
  if (lead) return lead;
  return `${intent || "Task"} request`;
}

function buildPlan(intent = "", risk = {}) {
  const base = [
    "Interpret request and isolate requested outcome.",
    "Route to the proper execution lane.",
    "Execute the smallest reliable action.",
    "Verify output with observable evidence."
  ];
  if (intent === "STAGE" || risk.approvalRequired) {
    base.push("Pause at approval boundary before irreversible action.");
  }
  return base;
}

function buildToolRouting(intent = "", laneDecision = {}, risk = {}) {
  const routing = [
    `${laneDecision.system || "Codex + MCP"} via ${laneDecision.lane || "code"} lane`
  ];
  if (intent === "MONITOR") routing.push("OpenClaw scheduling hooks for watch cadence");
  if (intent === "AUTOPILOT") routing.push("OpenClaw skill/runbook persistence");
  if (risk.level === "approval_required") routing.push("Approval gate before high-impact steps");
  if (risk.level === "prohibited") routing.push("Execution blocked by policy");
  return routing;
}

function buildExecutionLine(risk = {}, moduleId = "") {
  if (risk.level === "prohibited") {
    return "Blocked. Request conflicts with non-negotiable safety policy.";
  }
  if (risk.approvalRequired) {
    return "Prepared execution plan and staged changes pending approval boundary.";
  }
  return moduleId
    ? `Executing through module ${moduleId}.`
    : "Executing directly in selected lane.";
}

function buildEvidenceLine({ moduleResult, laneDecision, risk, laneResult }) {
  if (risk.level === "prohibited") return "Policy block recorded.";
  const evidence = [];
  if (moduleResult?.run?.id) evidence.push(`module_run=${moduleResult.run.id}`);
  if (moduleResult?.status) evidence.push(`status=${moduleResult.status}`);
  if (laneResult?.tool) evidence.push(`tool=${laneResult.tool}`);
  if (laneResult?.evidence) evidence.push(laneResult.evidence);
  if (laneResult?.approval?.id) evidence.push(`approval=${laneResult.approval.id}`);
  evidence.push(`lane=${laneDecision.lane}`);
  return evidence.join(" | ");
}

function buildRisksLine(risk = {}) {
  if (risk.level === "prohibited") {
    return "Prohibited action category detected. No execution permitted.";
  }
  if (risk.approvalRequired) {
    return "Crosses approval boundary. Waiting at high-impact step until approved.";
  }
  return "Low-risk execution path.";
}

function buildNextStepLine(risk = {}, intent = "") {
  if (risk.level === "prohibited") return "Provide a safer objective that stays within policy.";
  if (risk.approvalRequired || intent === "STAGE") return "Approve execution when ready, or revise scope.";
  if (intent === "AUTOPILOT") return "Confirm recurrence cadence and monitoring thresholds.";
  return "Continue automatically unless a new approval boundary appears.";
}

function listConfiguredLanes() {
  const model = readConfig(OPERATING_MODEL_FILE, {});
  const laneRouting = model?.laneRouting || {};
  const entries = Object.entries(laneRouting);
  return entries.map(([lane, value]) => `${lane}: ${value.system}`);
}

export function classifyAikaIntent(text = "") {
  const cleaned = stripAikaPrefix(text);
  const intent = detectIntent(cleaned);
  const laneDecision = classifyLane(cleaned, intent || "");
  const risk = detectRisk(cleaned);
  return {
    cleanedText: cleaned,
    intent,
    laneDecision,
    risk,
    moduleId: intent ? INTENT_TO_MODULE[intent] || "" : ""
  };
}

export function shouldHandleWithIntentProtocol(text = "") {
  const classification = classifyAikaIntent(text);
  return Boolean(classification.intent);
}

export function buildExecutionProtocolResponse({
  originalText = "",
  classification = null,
  moduleResult = null,
  laneResult = null
} = {}) {
  const resolved = classification || classifyAikaIntent(originalText);
  const goal = parseGoal(resolved.cleanedText, resolved.intent || "");
  const plan = buildPlan(resolved.intent || "", resolved.risk || {});
  const toolRouting = buildToolRouting(resolved.intent || "", resolved.laneDecision || {}, resolved.risk || {});
  const capabilityLines = [
    `available tools: OpenClaw, Codex + MCP, agent-browser, Skyvern, CUA, Opik`,
    `missing tools: none detected from current runtime context`,
    `trust boundaries: host, containers, sandbox/VM, external systems`,
    `selected lane: ${resolved.laneDecision.system} (${resolved.laneDecision.lane})`
  ];
  const executionLine = buildExecutionLine(resolved.risk || {}, resolved.moduleId);
  const evidenceLine = buildEvidenceLine({
    moduleResult,
    laneDecision: resolved.laneDecision || {},
    risk: resolved.risk || {},
    laneResult
  });
  const risksLine = buildRisksLine(resolved.risk || {});
  const nextStep = buildNextStepLine(resolved.risk || {}, resolved.intent || "");

  const reply = [
    "1. Goal",
    `- ${goal}`,
    "",
    "2. Capability Map",
    ...capabilityLines.map(line => `- ${line}`),
    "",
    "3. Plan",
    ...plan.map(step => `- ${step}`),
    "",
    "4. Tool Routing",
    ...toolRouting.map(step => `- ${step}`),
    "",
    "5. Execution",
    `- ${executionLine}`,
    "",
    "6. Evidence",
    `- ${evidenceLine}`,
    "",
    "7. Risks",
    `- ${risksLine}`,
    "",
    "8. Next Step",
    `- ${nextStep}`
  ].join("\n");

  return {
    intent: resolved.intent,
    lane: resolved.laneDecision,
    risk: resolved.risk,
    moduleId: resolved.moduleId,
    configuredLanes: listConfiguredLanes(),
    reply
  };
}
