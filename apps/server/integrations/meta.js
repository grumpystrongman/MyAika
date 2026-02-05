import { getProvider, setProvider } from "./store.js";

const FB_AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";
const FB_TOKEN_URL = "https://graph.facebook.com/v19.0/oauth/access_token";

function buildRedirectUri(product) {
  const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8790}`;
  return `${base}/api/integrations/meta/callback?product=${encodeURIComponent(product)}`;
}

function buildScopes(product) {
  if (product === "instagram") {
    return process.env.INSTAGRAM_SCOPES || "instagram_basic,instagram_manage_insights,pages_show_list";
  }
  if (product === "whatsapp") {
    return process.env.WHATSAPP_SCOPES || "whatsapp_business_management,whatsapp_business_messaging";
  }
  return process.env.FACEBOOK_SCOPES || "pages_show_list,pages_read_engagement,pages_manage_posts";
}

export function buildMetaAuthUrl(product, state) {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) throw new Error("facebook_oauth_not_configured");
  const redirectUri = buildRedirectUri(product);
  const scopes = buildScopes(product);
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: scopes,
    response_type: "code"
  });
  return `${FB_AUTH_URL}?${params.toString()}`;
}

export async function exchangeMetaCode({ code, product }) {
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) throw new Error("facebook_oauth_not_configured");
  const redirectUri = buildRedirectUri(product);
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: secret,
    redirect_uri: redirectUri,
    code
  });
  const r = await fetch(`${FB_TOKEN_URL}?${params.toString()}`);
  const data = await r.json();
  if (!data.access_token) throw new Error(data.error?.message || "facebook_token_exchange_failed");
  return data;
}

export function storeMetaToken(product, data, userId = "") {
  const existing = getProvider("meta", userId) || {};
  setProvider("meta", {
    ...existing,
    [product]: {
      access_token: data.access_token,
      token_type: data.token_type || "bearer",
      expires_in: data.expires_in || null
    },
    connectedAt: new Date().toISOString()
  }, userId);
}

export function getMetaToken(product, userId = "") {
  const existing = getProvider("meta", userId) || {};
  return existing?.[product]?.access_token || null;
}
