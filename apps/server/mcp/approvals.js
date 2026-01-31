import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const approvalsPath = path.join(repoRoot, "data", "approvals.json");

function ensureDir() {
  const dir = path.dirname(approvalsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadApprovals() {
  ensureDir();
  if (!fs.existsSync(approvalsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(approvalsPath, "utf-8"));
  } catch {
    return [];
  }
}

function saveApprovals(list) {
  ensureDir();
  fs.writeFileSync(approvalsPath, JSON.stringify(list, null, 2));
}

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

function makeToken() {
  return crypto.randomBytes(16).toString("hex");
}

export function createApproval(request) {
  const list = loadApprovals();
  const item = {
    id: makeId(),
    status: "pending",
    createdAt: new Date().toISOString(),
    ...request
  };
  list.push(item);
  saveApprovals(list);
  return item;
}

export function approveApproval(id, approvedBy) {
  const list = loadApprovals();
  const item = list.find(a => a.id === id);
  if (!item) return null;
  if (item.status !== "pending") return item;
  item.status = "approved";
  item.approvedBy = approvedBy || "user";
  item.approvedAt = new Date().toISOString();
  item.token = makeToken();
  saveApprovals(list);
  return item;
}

export function getApproval(id) {
  const list = loadApprovals();
  return list.find(a => a.id === id) || null;
}

export function listApprovals() {
  return loadApprovals();
}

export function markExecuted(id) {
  const list = loadApprovals();
  const item = list.find(a => a.id === id);
  if (!item) return null;
  item.status = "executed";
  item.executedAt = new Date().toISOString();
  saveApprovals(list);
  return item;
}
