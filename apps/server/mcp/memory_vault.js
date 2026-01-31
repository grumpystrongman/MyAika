import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const vaultDir = path.join(repoRoot, "data", "memory_vault");
const tiers = {
  memory_profile: "profile.jsonl",
  memory_work: "work.jsonl",
  memory_phi: "phi.jsonl"
};

function ensureDir() {
  if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });
}

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || "";
  if (!raw) return null;
  const buf = Buffer.from(raw, "hex");
  return buf.length === 32 ? buf : crypto.createHash("sha256").update(raw).digest();
}

function encryptField(value) {
  const key = getKey();
  if (!key) throw new Error("encryption_key_missing");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: data.toString("hex")
  };
}

function decryptField(payload) {
  const key = getKey();
  if (!key) throw new Error("encryption_key_missing");
  const iv = Buffer.from(payload.iv, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const data = Buffer.from(payload.data, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return out.toString("utf8");
}

export function writeMemory({ tier, content, metadata = {} }) {
  if (!tiers[tier]) throw new Error("unknown_memory_tier");
  ensureDir();
  const filePath = path.join(vaultDir, tiers[tier]);
  const record = {
    id: crypto.randomBytes(8).toString("hex"),
    tier,
    createdAt: new Date().toISOString(),
    metadata
  };
  if (tier === "memory_phi") {
    record.content = encryptField(content);
  } else {
    record.content = String(content);
  }
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n");
  return record;
}

export function listMemory({ tier, query }) {
  if (!tiers[tier]) throw new Error("unknown_memory_tier");
  ensureDir();
  const filePath = path.join(vaultDir, tiers[tier]);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/).filter(Boolean);
  const items = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  const results = items.map(item => {
    if (tier === "memory_phi") {
      try {
        return { ...item, content: decryptField(item.content) };
      } catch {
        return { ...item, content: "[ENCRYPTED]" };
      }
    }
    return item;
  });
  if (!query) return results;
  const q = query.toLowerCase();
  return results.filter(r => String(r.content || "").toLowerCase().includes(q));
}

export function rotateEncryptionKey() {
  return {
    status: "not_implemented",
    todo: "Implement key rotation with re-encryption of memory_phi records."
  };
}

