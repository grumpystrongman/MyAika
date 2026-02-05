import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dataDir = path.join(repoRoot, "data");
const storePath = path.join(dataDir, "sessions.json");
const COOKIE_NAME = "aika_session";

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readStore() {
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeStore(data) {
  ensureDir();
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const entries = header.split(";").map(part => part.trim()).filter(Boolean);
  const cookies = {};
  for (const entry of entries) {
    const idx = entry.indexOf("=");
    if (idx === -1) continue;
    const key = entry.slice(0, idx).trim();
    const value = entry.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return null;
  const store = readStore();
  const session = store[sessionId];
  if (!session) return null;
  session.lastSeenAt = new Date().toISOString();
  store[sessionId] = session;
  writeStore(store);
  return session;
}

export function createSession(user) {
  const store = readStore();
  const sessionId = crypto.randomBytes(18).toString("hex");
  const now = new Date().toISOString();
  store[sessionId] = {
    id: sessionId,
    user,
    createdAt: now,
    lastSeenAt: now
  };
  writeStore(store);
  return sessionId;
}

export function destroySession(sessionId) {
  if (!sessionId) return false;
  const store = readStore();
  if (!store[sessionId]) return false;
  delete store[sessionId];
  writeStore(store);
  return true;
}

export function setSessionCookie(res, sessionId) {
  const secure = String(process.env.PUBLIC_BASE_URL || "").startsWith("https");
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000"
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

