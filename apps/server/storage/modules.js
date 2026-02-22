import { getDb } from "./db.js";
import { nowIso, safeJsonParse } from "./utils.js";

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    level: row.level || "",
    description: row.description || "",
    triggerPhrases: safeJsonParse(row.trigger_phrases_json, []),
    requiredInputs: safeJsonParse(row.required_inputs_json, {}),
    actionDefinition: safeJsonParse(row.action_definition_json, {}),
    outputSchema: safeJsonParse(row.output_schema_json, {}),
    updatePolicy: safeJsonParse(row.update_policy_json, {}),
    requiresConfirmation: Boolean(row.requires_confirmation),
    enabled: Boolean(row.enabled),
    order: row.order_index ?? 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export function upsertModule(moduleDef) {
  if (!moduleDef?.id) throw new Error("module_id_required");
  const db = getDb();
  const now = nowIso();
  const existing = db.prepare("SELECT id FROM modules WHERE id = ?").get(moduleDef.id);
  const payload = [
    moduleDef.id,
    moduleDef.name || "",
    moduleDef.level || "",
    moduleDef.description || "",
    JSON.stringify(moduleDef.trigger_phrases || moduleDef.triggerPhrases || []),
    JSON.stringify(moduleDef.required_inputs || moduleDef.requiredInputs || {}),
    JSON.stringify(moduleDef.action_definition || moduleDef.actionDefinition || {}),
    JSON.stringify(moduleDef.output_schema || moduleDef.outputSchema || {}),
    JSON.stringify(moduleDef.update_policy || moduleDef.updatePolicy || {}),
    moduleDef.requires_confirmation ? 1 : 0,
    moduleDef.enabled === false ? 0 : 1,
    Number.isFinite(moduleDef.order) ? moduleDef.order : 0,
    now
  ];
  if (existing) {
    db.prepare(
      `UPDATE modules
       SET name = ?, level = ?, description = ?, trigger_phrases_json = ?, required_inputs_json = ?,
           action_definition_json = ?, output_schema_json = ?, update_policy_json = ?, requires_confirmation = ?,
           enabled = ?, order_index = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      payload[1],
      payload[2],
      payload[3],
      payload[4],
      payload[5],
      payload[6],
      payload[7],
      payload[8],
      payload[9],
      payload[10],
      payload[11],
      payload[12],
      moduleDef.id
    );
  } else {
    db.prepare(
      `INSERT INTO modules
        (id, name, level, description, trigger_phrases_json, required_inputs_json, action_definition_json,
         output_schema_json, update_policy_json, requires_confirmation, enabled, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      moduleDef.id,
      moduleDef.name || "",
      moduleDef.level || "",
      moduleDef.description || "",
      payload[4],
      payload[5],
      payload[6],
      payload[7],
      payload[8],
      payload[9],
      payload[10],
      payload[11],
      now,
      now
    );
  }
  const row = db.prepare("SELECT * FROM modules WHERE id = ?").get(moduleDef.id);
  return mapRow(row);
}

export function bulkUpsertModules(modules = []) {
  return modules.map(upsertModule);
}

export function listModules({ enabled = true } = {}) {
  const db = getDb();
  const rows = enabled
    ? db.prepare("SELECT * FROM modules WHERE enabled = 1 ORDER BY order_index ASC, name ASC").all()
    : db.prepare("SELECT * FROM modules ORDER BY order_index ASC, name ASC").all();
  return rows.map(mapRow).filter(Boolean);
}

export function getModule(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM modules WHERE id = ?").get(id);
  return mapRow(row);
}

export function findModuleByName(name = "") {
  const db = getDb();
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const row = db.prepare("SELECT * FROM modules WHERE name = ? COLLATE NOCASE").get(trimmed);
  return mapRow(row);
}
