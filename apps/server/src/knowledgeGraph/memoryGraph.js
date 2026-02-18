import { listMemoryEntities } from "../../storage/memory_entities.js";

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function pickTopLabel(variants) {
  let top = "";
  let max = 0;
  for (const [label, count] of Object.entries(variants || {})) {
    if (count > max) {
      top = label;
      max = count;
    }
  }
  return top || Object.keys(variants || {})[0] || "";
}

export function buildMemoryGraph({
  workspaceId = "default",
  limitNodes = 40,
  limitEdges = 80,
  maxEntities = 2000,
  minCount = 1
} = {}) {
  const rows = listMemoryEntities({ workspaceId, limit: maxEntities });
  const nodeMap = new Map();
  const byRecording = new Map();

  for (const row of rows) {
    const rawValue = row?.value || row?.normalized_value || "";
    const key = normalizeValue(row?.normalized_value || rawValue);
    if (!key) continue;
    const label = String(rawValue || key);
    const existing = nodeMap.get(key) || {
      id: key,
      label,
      type: row?.type || "entity",
      count: 0,
      variants: {}
    };
    existing.count += 1;
    existing.variants[label] = (existing.variants[label] || 0) + 1;
    if (!existing.type && row?.type) existing.type = row.type;
    nodeMap.set(key, existing);

    const recordingId = row?.recording_id || "";
    if (recordingId) {
      if (!byRecording.has(recordingId)) byRecording.set(recordingId, new Set());
      byRecording.get(recordingId).add(key);
    }
  }

  let nodes = Array.from(nodeMap.values())
    .filter(node => node.count >= minCount)
    .sort((a, b) => b.count - a.count);
  if (limitNodes > 0) nodes = nodes.slice(0, limitNodes);
  nodes = nodes.map(node => ({
    id: node.id,
    label: pickTopLabel(node.variants),
    type: node.type,
    count: node.count,
    aliases: Object.keys(node.variants).slice(0, 5)
  }));

  const nodeSet = new Set(nodes.map(node => node.id));
  const edgeMap = new Map();
  for (const values of byRecording.values()) {
    const keys = Array.from(values).filter(key => nodeSet.has(key));
    if (keys.length < 2) continue;
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = keys[i];
        const b = keys[j];
        const edgeKey = a < b ? `${a}||${b}` : `${b}||${a}`;
        edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
      }
    }
  }

  let edges = Array.from(edgeMap.entries())
    .map(([key, count]) => {
      const [source, target] = key.split("||");
      return { source, target, count };
    })
    .sort((a, b) => b.count - a.count);
  if (limitEdges > 0) edges = edges.slice(0, limitEdges);

  return {
    nodes,
    edges,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      entities: rows.length,
      recordings: byRecording.size
    }
  };
}
