import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { getPolicyConfig } from "../../mcp/policy.js";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const vaultDir = path.join(repoRoot, "data", "skills", "vault");

function ensureDir() {
  if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function listSkillVault() {
  ensureDir();
  return fs.readdirSync(vaultDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const manifestPath = path.join(vaultDir, entry.name, "manifest.json");
      const manifest = readJson(manifestPath) || {};
      return {
        id: entry.name,
        name: manifest.name || entry.name,
        version: manifest.version || "0.0.1",
        permissions: manifest.permissions || [],
        tools: manifest.tools || [],
        runtime: manifest.runtime || "prompt",
        updatedAt: manifest.updatedAt || null
      };
    });
}

export function getSkillVaultEntry(id) {
  const manifestPath = path.join(vaultDir, id, "manifest.json");
  const manifest = readJson(manifestPath);
  if (!manifest) return null;
  return {
    id,
    manifest
  };
}

function canRunSkill(manifest) {
  const unsafe = Boolean(manifest?.unsafe || manifest?.runtime === "code");
  if (unsafe && String(process.env.SKILL_VAULT_ENABLE_UNSAFE || "0") !== "1") {
    return { ok: false, reason: "skill_unsafe_disabled" };
  }
  return { ok: true };
}

function evaluateSkillPermissions(manifest) {
  const cfg = getPolicyConfig();
  const allowlist = cfg.allowlistNormal || [];
  const tools = Array.isArray(manifest?.tools) ? manifest.tools : [];
  const blocked = tools.filter(tool => allowlist.length && !allowlist.includes(tool));
  return { blockedTools: blocked };
}

function getOpenAi() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function runPromptSkill({ id, input, skipPolicyCheck = false }) {
  const entry = getSkillVaultEntry(id);
  if (!entry) throw new Error("skill_not_found");
  const manifest = entry.manifest || {};
  const allowed = canRunSkill(manifest);
  if (!allowed.ok) {
    const err = new Error(allowed.reason);
    err.status = 403;
    throw err;
  }
  if (!skipPolicyCheck) {
    const perms = evaluateSkillPermissions(manifest);
    if (perms.blockedTools?.length) {
      const err = new Error("skill_requires_approval");
      err.status = 403;
      err.detail = { blockedTools: perms.blockedTools };
      throw err;
    }
  }

  const promptPath = path.join(vaultDir, id, manifest.prompt || "prompt.md");
  const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, "utf8") : "";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = getOpenAi();
  if (!client) throw new Error("missing_openai_api_key");

  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: prompt || "You are a helpful assistant." }] },
      { role: "user", content: [{ type: "input_text", text: String(input || "") }] }
    ],
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 300)
  });

  return {
    output: response?.output_text || "",
    ranAt: nowIso()
  };
}

export function scanSkillWithVirusTotal(_id) {
  if (!process.env.VIRUSTOTAL_API_KEY) {
    return { status: "disabled" };
  }
  return { status: "stub", note: "VirusTotal scan hook is stubbed; wire up when needed." };
}

export function assessSkillPermissions(id) {
  const entry = getSkillVaultEntry(id);
  if (!entry) return { blockedTools: ["skill_not_found"] };
  return evaluateSkillPermissions(entry.manifest || {});
}
