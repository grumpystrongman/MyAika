import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const plansFile = path.join(repoRoot, "data", "spreadsheet_plans.json");

function ensureDir() {
  const dir = path.dirname(plansFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadPlans() {
  try {
    if (!fs.existsSync(plansFile)) return [];
    return JSON.parse(fs.readFileSync(plansFile, "utf-8"));
  } catch {
    return [];
  }
}

function savePlans(items) {
  ensureDir();
  fs.writeFileSync(plansFile, JSON.stringify(items, null, 2));
}

export function applyChanges({ filePath, changes }) {
  const plans = loadPlans();
  const plan = {
    id: Date.now().toString(36),
    filePath,
    changes,
    status: "draft_plan",
    createdAt: new Date().toISOString(),
    note: "Provider not configured; plan only."
  };
  plans.push(plan);
  savePlans(plans);
  return plan;
}

