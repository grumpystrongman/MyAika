const INTENT_PREFIX = /^(execute|prepare|analy[sz]e|control|build|monitor|optimi[sz]e|simulate|stage|autopilot|run|start)\b[\s,:-]*/i;

const WORKFLOW_SKILLS = [
  {
    id: "daily_digest_cockpit",
    name: "Daily Digest Cockpit",
    kind: "digest",
    digestType: "daily",
    patterns: [
      /^(run\s+)?(my\s+)?daily digest$/i,
      /\bmorning (work )?cockpit\b/i
    ]
  },
  {
    id: "research_and_summarize",
    name: "Research And Summarize",
    kind: "module",
    moduleId: "quick_summaries",
    patterns: [
      /\bresearch and summarize\b/i,
      /\bsummarize (this )?research\b/i,
      /\bmulti[-\s]?source research brief\b/i
    ]
  },
  {
    id: "inbox_triage_fastlane",
    name: "Inbox Triage Fastlane",
    kind: "module",
    moduleId: "inbox_triage",
    patterns: [
      /\btriage inbox\b/i,
      /\binbox triage\b/i,
      /\bprocess inbox\b/i
    ]
  },
  {
    id: "calendar_hygiene_fastlane",
    name: "Calendar Hygiene Fastlane",
    kind: "module",
    moduleId: "calendar_hygiene",
    patterns: [
      /\bcalendar hygiene\b/i,
      /\bclean my calendar\b/i,
      /\bcalendar conflicts\b/i
    ]
  },
  {
    id: "meeting_to_action_engine",
    name: "Meeting To Action Engine",
    kind: "module",
    moduleId: "meeting_packets",
    patterns: [
      /\bmeeting packet(s)?\b/i,
      /\bmeeting to action\b/i,
      /\bprepare meeting\b/i,
      /\bprep meeting\b/i
    ]
  },
  {
    id: "incident_triage_command",
    name: "Incident Triage Command",
    kind: "runbook",
    runbookName: "Incident Response",
    patterns: [
      /\bincident response\b/i,
      /\bstart incident\b/i,
      /\bincident triage\b/i,
      /\bincident commander\b/i
    ]
  }
];

function normalize(text) {
  return String(text || "").trim();
}

function stripAikaPrefix(text) {
  const cleaned = normalize(text);
  const match = cleaned.match(/^aika(?:[\s,:-]+)(.+)$/i);
  return match ? String(match[1] || "").trim() : cleaned;
}

function stripIntentPrefix(text) {
  return normalize(text).replace(INTENT_PREFIX, "").trim();
}

function buildCandidates(text) {
  const cleaned = stripAikaPrefix(text);
  const intentStripped = stripIntentPrefix(cleaned);
  const withNoLeadingMy = intentStripped.replace(/^my\s+/i, "").trim();
  return Array.from(
    new Set(
      [cleaned, intentStripped, withNoLeadingMy]
        .map(item => String(item || "").toLowerCase().trim())
        .filter(Boolean)
    )
  );
}

function skillMatches(skill, candidates = []) {
  return candidates.some(candidate => skill.patterns.some(pattern => pattern.test(candidate)));
}

export function listWorkflowSkills() {
  return WORKFLOW_SKILLS.map(skill => ({
    id: skill.id,
    name: skill.name,
    kind: skill.kind,
    moduleId: skill.moduleId || "",
    runbookName: skill.runbookName || "",
    digestType: skill.digestType || ""
  }));
}

export function findWorkflowSkill(text = "") {
  const candidates = buildCandidates(text);
  if (!candidates.length) return null;
  return WORKFLOW_SKILLS.find(skill => skillMatches(skill, candidates)) || null;
}

export async function executeWorkflowSkillIfMatched({
  text = "",
  context = {},
  deps = {}
} = {}) {
  const matched = findWorkflowSkill(text);
  if (!matched) return null;

  const cleaned = stripAikaPrefix(text);
  const payloadText = stripIntentPrefix(cleaned) || cleaned;

  if (matched.kind === "digest") {
    if (typeof deps.digestBuilder !== "function") {
      throw new Error("digest_builder_missing");
    }
    const digest = await deps.digestBuilder(matched.digestType, { userId: context.userId || "local" });
    if (typeof deps.digestRecorder === "function") {
      deps.digestRecorder({ userId: context.userId || "local", digest });
    }
    return {
      handled: true,
      status: "completed",
      reply: digest?.text || "Digest prepared.",
      data: {
        workflowSkill: { id: matched.id, name: matched.name, kind: matched.kind },
        digest
      }
    };
  }

  if (matched.kind === "module") {
    if (typeof deps.moduleExecutor !== "function") {
      throw new Error("module_executor_missing");
    }
    const moduleResult = await deps.moduleExecutor({
      moduleId: matched.moduleId,
      inputPayload: {
        context_text: payloadText,
        structured_input: { workflow_skill: matched.id }
      },
      context,
      toolExecutor: deps.toolExecutor || null
    });
    return {
      handled: true,
      status: moduleResult?.status || "completed",
      reply: moduleResult?.output?.summary || `${matched.name} completed.`,
      data: {
        workflowSkill: { id: matched.id, name: matched.name, kind: matched.kind },
        moduleResult
      },
      approval: moduleResult?.approval || null
    };
  }

  if (matched.kind === "runbook") {
    if (typeof deps.runbookExecutor !== "function") {
      throw new Error("runbook_executor_missing");
    }
    const runbookResult = await deps.runbookExecutor({
      name: matched.runbookName,
      inputPayload: {
        context_text: payloadText,
        structured_input: { workflow_skill: matched.id }
      },
      context
    });
    return {
      handled: true,
      status: runbookResult?.status || "completed",
      reply: runbookResult?.output?.summary || `${matched.name} completed.`,
      data: {
        workflowSkill: { id: matched.id, name: matched.name, kind: matched.kind },
        runbookResult
      }
    };
  }

  return null;
}
