import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { repoRoot, ensureDir } from "./utils.js";

const secretsDir = path.join(repoRoot, "secrets");
const keyPath = path.join(secretsDir, "memory_vault.key");

function loadKey() {
  try {
    return fs.readFileSync(keyPath);
  } catch {
    return null;
  }
}

function writeKey(buf) {
  ensureDir(secretsDir);
  fs.writeFileSync(keyPath, buf);
}

export function ensureKey() {
  let key = loadKey();
  if (key && key.length === 32) return key;
  const fresh = crypto.randomBytes(32);
  writeKey(fresh);
  return fresh;
}

export function encryptString(plaintext) {
  const key = ensureKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    nonce: iv.toString("base64"),
    ct: Buffer.concat([data, tag]).toString("base64")
  });
}

export function decryptString(payload) {
  const key = ensureKey();
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const iv = Buffer.from(parsed.nonce, "base64");
  const raw = Buffer.from(parsed.ct, "base64");
  const data = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return out.toString("utf8");
}

export function rotateKey() {
  ensureDir(secretsDir);
  const current = loadKey();
  const retiredPath = path.join(secretsDir, `memory_vault.key.retired.${Date.now()}`);
  if (current) fs.writeFileSync(retiredPath, current);
  const next = crypto.randomBytes(32);
  writeKey(next);
  return {
    status: "rotation_staged",
    retiredKey: current ? retiredPath : null
  };
}
