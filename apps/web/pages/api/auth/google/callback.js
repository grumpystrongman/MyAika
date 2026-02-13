function getServerBase() {
  return process.env.AIKA_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || "http://127.0.0.1:8790";
}

export default async function handler(req, res) {
  const base = getServerBase();
  const url = new URL("/api/integrations/google/callback", base);
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, String(v)));
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const resp = await fetch(url.toString(), { redirect: "manual" });
    const location = resp.headers.get("location");
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    if (location) {
      res.status(302).setHeader("Location", location);
      return res.end();
    }
    const text = await resp.text();
    res.status(resp.status || 500).send(text || "google_callback_failed");
  } catch (err) {
    res.status(502).send(err?.message || "google_callback_proxy_failed");
  }
}
