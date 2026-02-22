import { readConfigList } from "./config.js";
import { bulkUpsertModules, listModules, findModuleByName } from "../../storage/modules.js";

const MODULES_CONFIG = "aika_modules.json";

function normalizeModule(moduleDef, index = 0) {
  if (!moduleDef || typeof moduleDef !== "object") return null;
  const id = String(moduleDef.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(moduleDef.name || id),
    level: String(moduleDef.level || ""),
    description: String(moduleDef.description || ""),
    trigger_phrases: Array.isArray(moduleDef.trigger_phrases)
      ? moduleDef.trigger_phrases
      : Array.isArray(moduleDef.triggerPhrases)
        ? moduleDef.triggerPhrases
        : [],
    required_inputs: moduleDef.required_inputs || moduleDef.requiredInputs || {},
    action_definition: moduleDef.action_definition || moduleDef.actionDefinition || {},
    output_schema: moduleDef.output_schema || moduleDef.outputSchema || {},
    update_policy: moduleDef.update_policy || moduleDef.updatePolicy || {},
    requires_confirmation: Boolean(moduleDef.requires_confirmation || moduleDef.requiresConfirmation),
    enabled: moduleDef.enabled !== false,
    order: Number.isFinite(moduleDef.order) ? moduleDef.order : (index + 1),
    templates: moduleDef.templates || {}
  };
}

export function loadModuleDefinitions() {
  const raw = readConfigList(MODULES_CONFIG);
  return raw.map((moduleDef, idx) => normalizeModule(moduleDef, idx)).filter(Boolean);
}

export function syncModuleRegistry() {
  const modules = loadModuleDefinitions();
  if (!modules.length) return [];
  return bulkUpsertModules(modules);
}

export function listModuleRegistry({ includeDisabled = false } = {}) {
  const stored = listModules({ enabled: !includeDisabled });
  const configModules = loadModuleDefinitions();
  if (stored.length) {
    const configById = new Map(configModules.map(mod => [mod.id, mod]));
    return stored.map(moduleDef => {
      const config = configById.get(moduleDef.id);
      return {
        ...moduleDef,
        templates: config?.templates || moduleDef.templates || {}
      };
    });
  }
  return configModules.map(mod => ({
    ...mod,
    triggerPhrases: mod.trigger_phrases || []
  }));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function findModuleByTrigger(text, modules = null) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const list = modules || listModuleRegistry({ includeDisabled: true });
  for (const moduleDef of list) {
    const triggers = moduleDef.triggerPhrases || moduleDef.trigger_phrases || [];
    for (const trigger of triggers) {
      if (!trigger) continue;
      const normalizedTrigger = normalizeText(trigger);
      if (normalized.includes(normalizedTrigger)) {
        return moduleDef;
      }
    }
  }
  return null;
}

export function findModuleByNameOrTrigger(text, modules = null) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const byName = findModuleByName(trimmed);
  if (byName) return byName;
  return findModuleByTrigger(trimmed, modules);
}

export function formatModuleSummary(modules = []) {
  const list = modules.length ? modules : listModuleRegistry({ includeDisabled: false });
  const grouped = new Map();
  for (const moduleDef of list) {
    const level = moduleDef.level || "Unsorted";
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(moduleDef);
  }
  const lines = [];
  for (const [level, items] of grouped.entries()) {
    lines.push(`Level ${level}`);
    for (const moduleDef of items) {
      const triggers = (moduleDef.triggerPhrases || moduleDef.trigger_phrases || []).slice(0, 2).join(" | ");
      lines.push(`- ${moduleDef.name}${triggers ? ` (${triggers})` : ""}`);
    }
  }
  return lines.join("\n");
}
