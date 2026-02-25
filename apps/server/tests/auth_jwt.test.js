import test from "node:test";
import assert from "node:assert/strict";
import { signJwt, verifyJwt, parseJwtFromRequest } from "../auth/jwt.js";

const originalSecret = process.env.AUTH_JWT_SECRET;

process.env.AUTH_JWT_SECRET = "test-jwt-secret";

test.after(() => {
  if (originalSecret === undefined) {
    delete process.env.AUTH_JWT_SECRET;
  } else {
    process.env.AUTH_JWT_SECRET = originalSecret;
  }
});

test("auth jwt: sign and verify roundtrip", () => {
  const token = signJwt({ sub: "user-123", roles: ["admin"] }, { expiresIn: "1h" });
  const payload = verifyJwt(token);
  assert.equal(payload.sub, "user-123");
  assert.ok(Array.isArray(payload.roles));
});

test("auth jwt: parses bearer and cookie tokens", () => {
  const token = signJwt({ sub: "user-456" }, { expiresIn: "1h" });
  const bearerReq = { headers: { authorization: `Bearer ${token}` } };
  assert.equal(parseJwtFromRequest(bearerReq), token);

  const cookieReq = { headers: { cookie: `aika_jwt=${encodeURIComponent(token)}` } };
  assert.equal(parseJwtFromRequest(cookieReq), token);
});

test("auth jwt: expired token rejected", async () => {
  const token = signJwt({ sub: "user-expired" }, { expiresIn: "1s" });
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.throws(() => verifyJwt(token), /expired/i);
});
