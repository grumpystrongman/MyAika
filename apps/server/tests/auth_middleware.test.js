import test from "node:test";
import assert from "node:assert/strict";
import { signJwt } from "../auth/jwt.js";
import { authMiddleware, requireAuth } from "../auth/middleware.js";
import { getContextUserId } from "../auth/context.js";

const originalSecret = process.env.AUTH_JWT_SECRET;
process.env.AUTH_JWT_SECRET = "test-middleware-secret";

test.after(() => {
  if (originalSecret === undefined) {
    delete process.env.AUTH_JWT_SECRET;
  } else {
    process.env.AUTH_JWT_SECRET = originalSecret;
  }
});

test("auth middleware: jwt sets user context", () => {
  const token = signJwt({
    sub: "user-789",
    roles: ["admin"],
    tenantId: "tenant-1",
    sid: "session-1"
  }, { expiresIn: "1h" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  authMiddleware(req, {}, () => {
    assert.equal(req.aikaUser?.id, "user-789");
    assert.ok(req.aikaRoles.includes("admin"));
    assert.equal(req.aikaTenantId, "tenant-1");
    assert.equal(getContextUserId({ fallback: "" }), "user-789");
  });
});

test("auth middleware: requireAuth blocks missing user when enabled", () => {
  const originalRequired = process.env.AUTH_REQUIRED;
  process.env.AUTH_REQUIRED = "1";
  const req = { aikaUser: null };
  let statusCode = null;
  let payload = null;
  const res = {
    status(code) {
      statusCode = code;
      return {
        json(body) {
          payload = body;
        }
      };
    }
  };
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(statusCode, 401);
  assert.equal(payload?.error, "auth_required");
  assert.equal(nextCalled, false);

  if (originalRequired === undefined) {
    delete process.env.AUTH_REQUIRED;
  } else {
    process.env.AUTH_REQUIRED = originalRequired;
  }
});
