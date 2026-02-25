import jwt from "jsonwebtoken";

const COOKIE_NAME = process.env.AUTH_JWT_COOKIE || "aika_jwt";
const DEFAULT_TTL = process.env.AUTH_JWT_TTL || "30d";

function resolveJwtSecret() {
  return process.env.AUTH_JWT_SECRET || process.env.AIKA_JWT_SECRET || process.env.SESSION_SECRET || "";
}

function ensureJwtSecret() {
  const secret = resolveJwtSecret();
  if (secret) return secret;
  const authRequired = String(process.env.AUTH_REQUIRED || process.env.AIKA_AUTH_REQUIRED || "") === "1";
  if (authRequired) {
    throw new Error("auth_jwt_secret_missing");
  }
  return "aika-dev-secret";
}

function parseCookies(req) {
  const header = req?.headers?.cookie || "";
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

export function signJwt(payload = {}, { expiresIn } = {}) {
  const secret = ensureJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn || DEFAULT_TTL,
    issuer: "aika"
  });
}

export function verifyJwt(token) {
  const secret = ensureJwtSecret();
  return jwt.verify(token, secret, { issuer: "aika" });
}

export function parseJwtFromRequest(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || "";
  if (header && typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] || "";
}

export function setJwtCookie(res, token, { maxAgeSeconds = 60 * 60 * 24 * 30 } = {}) {
  const secure = String(process.env.PUBLIC_BASE_URL || "").startsWith("https");
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearJwtCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}
