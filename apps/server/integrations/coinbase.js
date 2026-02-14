export function normalizeCoinbaseScopes(scopes) {
  if (!scopes) return "";
  return String(scopes)
    .split(/[\\s,]+/)
    .filter(Boolean)
    .join(" ");
}

export function buildCoinbaseAuthUrl({ clientId, redirectUri, scope, state }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scope || "",
    state
  });
  return `https://www.coinbase.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCoinbaseCode({ clientId, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });
  const resp = await fetch("https://api.coinbase.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    const error = data.error_description || data.error || "coinbase_oauth_failed";
    throw new Error(error);
  }
  return data;
}

export async function revokeCoinbaseToken({ clientId, clientSecret, token }) {
  if (!token) return { ok: true };
  const body = new URLSearchParams({
    token,
    client_id: clientId,
    client_secret: clientSecret
  });
  const resp = await fetch("https://api.coinbase.com/oauth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!resp.ok) {
    return { ok: false };
  }
  return { ok: true };
}
