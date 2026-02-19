import test from "node:test";
import assert from "node:assert/strict";
import { connectMicrosoft, exchangeMicrosoftCode, getMicrosoftAccessToken, getMicrosoftStatus } from "../integrations/microsoft.js";
import { setProvider } from "../integrations/store.js";

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    process.env[key] = values[key];
  }
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test("microsoft connect builds auth url with pkce", async () => {
  await withEnv({
    MICROSOFT_CLIENT_ID: "test-client",
    MICROSOFT_CLIENT_SECRET: "test-secret",
    MICROSOFT_TENANT_ID: "organizations",
    MICROSOFT_REDIRECT_URI: "http://localhost:8790/api/integrations/microsoft/callback"
  }, async () => {
    const url = connectMicrosoft("mail_read", { uiBase: "http://localhost:3000" });
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "login.microsoftonline.com");
    assert.ok(parsed.pathname.includes("/organizations/oauth2/v2.0/authorize"));
    assert.equal(parsed.searchParams.get("client_id"), "test-client");
    assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
    assert.ok(parsed.searchParams.get("code_challenge"));
    assert.ok(parsed.searchParams.get("state"));
    const scope = parsed.searchParams.get("scope") || "";
    assert.ok(scope.includes("Mail.Read"));
    setProvider("microsoft_oauth_state", null);
  });
});

test("microsoft token exchange returns token payload", async () => {
  const originalFetch = global.fetch;
  await withEnv({
    MICROSOFT_CLIENT_ID: "test-client",
    MICROSOFT_CLIENT_SECRET: "test-secret",
    MICROSOFT_TENANT_ID: "common",
    MICROSOFT_REDIRECT_URI: "http://localhost:8790/api/integrations/microsoft/callback"
  }, async () => {
    const authUrl = connectMicrosoft("mail_read", { uiBase: "http://localhost:3000" });
    const state = new URL(authUrl).searchParams.get("state");
    assert.ok(state);
    global.fetch = async (url) => ({
      ok: true,
      json: async () => ({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        scope: "https://graph.microsoft.com/Mail.Read",
        token_type: "Bearer",
        id_token: "header.payload.signature"
      }),
      text: async () => ""
    });

    const token = await exchangeMicrosoftCode("abc123", state);
    assert.equal(token.access_token, "access-token");
    assert.equal(token.refresh_token, "refresh-token");
    assert.equal(token.token_type, "Bearer");
    assert.ok(token.expires_at > Date.now());
    setProvider("microsoft_oauth_state", null);
  }).finally(() => {
    global.fetch = originalFetch;
  });
});

test("microsoft access token enforces required scopes", async () => {
  const userId = "test-user";
  setProvider("microsoft", {
    access_token: "token",
    refresh_token: "refresh",
    expires_at: Date.now() + 60_000,
    scope: "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read",
    tenantId: "tenant-123"
  }, userId);

  const token = await getMicrosoftAccessToken(["https://graph.microsoft.com/Mail.ReadBasic"], userId);
  assert.equal(token, "token");

  let error = null;
  try {
    await getMicrosoftAccessToken(["https://graph.microsoft.com/Calendars.Read"], userId);
  } catch (err) {
    error = err;
  }
  assert.ok(error);
  assert.equal(error.status, 400);
  assert.equal(error.message, "microsoft_scopes_mismatch");

  const status = getMicrosoftStatus(userId);
  assert.equal(status.connected, true);
  assert.ok(status.scopes.includes("mail.read"));

  setProvider("microsoft", null, userId);
});
