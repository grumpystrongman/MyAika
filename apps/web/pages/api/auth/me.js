export default async function handler(req, res) {
  const base =
    process.env.AIKA_SERVER_URL
    || process.env.NEXT_PUBLIC_SERVER_URL
    || "http://127.0.0.1:8790";
  try {
    const resp = await fetch(`${base}/api/auth/me`, {
      headers: { cookie: req.headers.cookie || "" }
    });
    const text = await resp.text();
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) res.setHeader("set-cookie", setCookie);
    res.status(resp.status).send(text);
  } catch (err) {
    res.status(502).json({ authenticated: false, error: err?.message || "auth_proxy_failed" });
  }
}
