function resolveBaseUrl() {
  return (
    process.env.COINBASE_TRADE_API_URL ||
    process.env.TRADING_API_URL ||
    "http://localhost:8088"
  ).replace(/\/+$/, "");
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data };
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const health = await fetchJson(`${baseUrl}/health`);
  if (!health.ok) {
    console.error("coinbase_auth_smoke_failed: trading engine not reachable", health.status, health.data);
    process.exit(1);
  }

  const authorize = await fetchJson(`${baseUrl}/oauth/coinbase/authorize?subject=local`);
  if (!authorize.ok) {
    console.error("coinbase_auth_smoke_failed: coinbase oauth not configured", authorize.status, authorize.data);
    process.exit(1);
  }

  const url = authorize.data?.authorize_url || "";
  if (!url) {
    console.error("coinbase_auth_smoke_failed: missing authorize_url", authorize.data);
    process.exit(1);
  }

  console.log("coinbase_auth_smoke_ok");
  console.log("Authorize URL:", url);
  console.log("Open the URL in a browser to complete Coinbase OAuth.");
}

main().catch(err => {
  console.error("coinbase_auth_smoke_failed", err?.message || err);
  process.exit(1);
});
